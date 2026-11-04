import crypto from 'node:crypto';

import { log } from 'apify';
import * as cheerio from 'cheerio';
import { Impit } from 'impit';

export const DEFAULT_START_URL = 'https://www.careerbliss.com/cisco-systems/reviews/';

const BASE_HOSTNAME = 'www.careerbliss.com';

// Every profile below loads the review markup; Android okhttp profiles get 403.
// Rotation happens only after a failure, so a healthy run keeps one fingerprint.
const PROFILE_POOL = [
    'chrome',
    'chrome151',
    'chrome142',
    'chrome136',
    'chrome131',
    'firefox158',
    'firefox144',
    'firefox135',
    'ios18',
];
const MAX_ATTEMPTS = PROFILE_POOL.length + 1;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_BACKOFF_MS = 8_000;
const CLIENT_CACHE_LIMIT = 10;
const MAX_RETRY_AFTER_MS = 15_000;

const RETRYABLE_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const PERMANENT_STATUS = new Set([400, 401, 404, 406, 410, 451]);

const REVIEW_CARD_SELECTOR = '.company-reviews';
const REVIEW_ANCHOR_SELECTOR = 'a.job-title, a[data-reviewid], .spotlight-container a';

const CHALLENGE_MARKERS = [
    /<title>\s*just a moment/i,
    /cf-chl-/i,
    /challenge-platform/i,
    /attention required/i,
    /enable javascript and cookies to continue/i,
];

const REVIEW_MARKERS = [/data-reviewid\s*=/i, /company-reviews/i, /"@type"\s*:\s*"Review"/i];

class PermanentFetchError extends Error {}

/**
 * Turns a user supplied CareerBliss URL into the review listing root.
 * Overview URLs gain `/reviews/`; filtered and job-title URLs keep their scope.
 */
export function normalizeReviewRoot(rawUrl) {
    const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!value) throw new Error('Empty URL supplied.');

    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const parsed = new URL(withProtocol);

    if (parsed.hostname !== 'careerbliss.com' && !parsed.hostname.endsWith('.careerbliss.com')) {
        throw new Error(`URL must be on careerbliss.com: ${rawUrl}`);
    }
    if (parsed.hostname === 'careerbliss.com') parsed.hostname = BASE_HOSTNAME;
    parsed.protocol = 'https:';

    const segments = parsed.pathname.split('/').filter(Boolean);
    const reviewsIndex = segments.findIndex((segment) => segment.toLowerCase() === 'reviews');

    if (reviewsIndex === -1) {
        const slug = segments[0] === 'company' ? segments[1] : segments[0];
        if (!slug) throw new Error(`Cannot infer a company from URL: ${rawUrl}`);
        parsed.pathname = `/${slug}/reviews/`;
    } else {
        parsed.pathname = `/${segments.join('/')}/`;
    }

    parsed.hash = '';
    parsed.searchParams.delete('page');

    return parsed.toString();
}

export function buildPageUrl(rootUrl, pageNumber) {
    const pageUrl = new URL(rootUrl);
    if (pageNumber > 1) pageUrl.searchParams.set('page', String(pageNumber));
    else pageUrl.searchParams.delete('page');
    return pageUrl.toString();
}

/**
 * Keeps one client per fingerprint and proxy pair, retries temporary failures
 * with a new fingerprint and proxy session, and returns null for a gone page.
 */
export function createPageFetcher({ proxyConfiguration, runId = 'local' } = {}) {
    const clients = new Map();
    let sessionCounter = 0;
    // A profile that just worked stays in front, so a mid-run block costs one
    // failed attempt instead of one per page for the rest of the run.
    let preferredIndex = 0;

    const clientFor = (browser, proxyUrl) => {
        const key = `${browser}|${proxyUrl ?? ''}`;
        const cached = clients.get(key);
        if (cached) {
            clients.delete(key);
            clients.set(key, cached);
            return cached;
        }

        const client = new Impit({
            browser,
            ...(proxyUrl ? { proxyUrl } : {}),
        });

        clients.set(key, client);
        if (clients.size > CLIENT_CACHE_LIMIT) {
            const oldestKey = clients.keys().next().value;
            clients.delete(oldestKey);
        }
        return client;
    };

    return async function fetchPage(url) {
        let lastReason = 'no attempt was made';

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const profileIndex = (preferredIndex + attempt) % PROFILE_POOL.length;
            const browser = PROFILE_POOL[profileIndex];
            sessionCounter += 1;
            const sessionId = proxyConfiguration ? toSessionId(runId, sessionCounter) : undefined;
            const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(sessionId) : undefined;
            const client = clientFor(browser, proxyUrl);

            try {
                const response = await client.fetch(url, { timeout: REQUEST_TIMEOUT_MS });
                const { status } = response;

                if (status === 200) {
                    const html = await response.text();
                    if (looksLikeChallenge(html)) {
                        lastReason = 'an anti-bot challenge page';
                    } else if (!looksLikeReviewPage(html)) {
                        lastReason = 'an unexpected document without review markup';
                    } else {
                        preferredIndex = profileIndex;
                        return html;
                    }
                } else if (status === 404 || status === 410) {
                    return null;
                } else if (PERMANENT_STATUS.has(status)) {
                    throw new PermanentFetchError(`HTTP ${status} for ${url}`);
                } else {
                    lastReason = `HTTP ${status}`;
                    if (!RETRYABLE_STATUS.has(status)) {
                        throw new PermanentFetchError(`HTTP ${status} for ${url}`);
                    }
                }

                const retryAfter = status === 429 || status === 503 ? readRetryAfter(response) : undefined;
                log.warning(
                    `Request attempt ${attempt + 1}/${MAX_ATTEMPTS} hit ${lastReason}; switching profile and retrying.`,
                );
                await sleep(retryAfter ?? backoffDelay(attempt));
            } catch (error) {
                if (error instanceof PermanentFetchError) throw error;

                lastReason = error?.message || String(error);
                log.warning(
                    `Request attempt ${attempt + 1}/${MAX_ATTEMPTS} failed (${lastReason}); switching profile and retrying.`,
                );
                await sleep(backoffDelay(attempt));
            }
        }

        throw new Error(
            `Could not load ${url} after ${MAX_ATTEMPTS} attempts (last problem: ${lastReason}). ` +
                'If this keeps happening, enable Apify Proxy for the run.',
        );
    };
}

/**
 * Reads one listing page: structured data supplies exact ratings, cards supply
 * identifiers and sub-ratings, and either source keeps the run alive alone.
 */
export function parseReviewsPage(html, pageUrl) {
    const $ = cheerio.load(html);
    const nodes = flattenJsonLd(readJsonLdBlocks($));

    const aggregate = readAggregateRating(nodes) ?? readAggregateFallback($);
    const structuredReviews = readStructuredReviews(nodes);
    const companyName =
        aggregate?.company_name ?? structuredReviews[0]?.company_name ?? readCompanyName($, pageUrl) ?? undefined;

    const ratingByText = new Map();
    for (const review of structuredReviews) {
        if (review.rating === undefined) continue;
        ratingByText.set(reviewTextKey(review.review_text), review.rating);
    }

    const collected = new Map();
    const scopes = [];
    $(REVIEW_CARD_SELECTOR).each((_, element) => scopes.push($(element)));

    if (!scopes.length) {
        $('[data-reviewid]').each((_, element) => {
            let $candidate = $(element);
            for (let level = 0; level < 3; level += 1) {
                $candidate = $candidate.parent();
                if (!$candidate.length) break;
                if ($candidate.find('p.comments, .review, [itemprop="reviewBody"]').length) {
                    scopes.push($candidate);
                    break;
                }
            }
        });
    }

    for (const $scope of scopes) {
        const item = readReviewCard($, $scope, { pageUrl, companyName, ratingByText });
        if (!item) continue;

        const existing = collected.get(item.review_id);
        if (!existing || countFilled(item) > countFilled(existing)) {
            collected.set(item.review_id, item);
        }
    }

    if (!collected.size) {
        for (const review of structuredReviews) {
            const reviewId = hashId([review.company_name, review.job_title, review.review_text, review.rating]);
            collected.set(
                reviewId,
                cleanObject({
                    review_id: reviewId,
                    company_name: review.company_name ?? companyName,
                    job_title: review.job_title,
                    rating: review.rating,
                    review_text: review.review_text,
                    source_url: pageUrl,
                }),
            );
        }
    }

    return {
        reviews: [...collected.values()],
        aggregate_rating: aggregate?.aggregate_rating,
        aggregate_review_count: aggregate?.aggregate_review_count,
    };
}

function readReviewCard($, $scope, context) {
    if (!$scope?.length) return null;

    const identifier = $scope.find('[data-reviewid]').first();
    const anchor = $scope.find(REVIEW_ANCHOR_SELECTOR).first();
    const href = anchor.attr('href');
    const reviewId = cleanText(identifier.attr('data-reviewid')) ?? readHashFragment(href);

    if (!reviewId && !href) return null;

    const reviewText = readReviewText($, $scope);
    if (!reviewText) return null;

    const jobTitle = cleanText(identifier.attr('data-jobtitle')) ?? cleanText(anchor.text());
    const companyName = cleanText(identifier.attr('data-company')) ?? context.companyName;
    const rating = context.ratingByText.get(reviewTextKey(reviewText)) ?? readStarRating($scope);
    const resolvedId = reviewId ?? hashId([companyName, jobTitle, reviewText, rating]);

    return cleanObject({
        review_id: resolvedId,
        company_name: companyName,
        job_title: jobTitle,
        rating,
        review_text: reviewText,
        location: readLocation($, $scope),
        review_url: href ? absoluteUrl(href, context.pageUrl) : `${context.pageUrl.split('#')[0]}#${resolvedId}`,
        source_url: context.pageUrl,
        ...readSubRatings($, $scope),
    });
}

function readReviewText($, $scope) {
    const candidates = [
        $scope.find('p.comments').first().text(),
        $scope.find('.review').first().text(),
        $scope.find('[itemprop="reviewBody"]').first().text(),
    ];

    for (const candidate of candidates) {
        const text = stripWrappingQuotes(cleanText(candidate));
        if (text) return text;
    }

    return undefined;
}

function readStarRating($scope) {
    const stars = $scope.find('.rating-container .rating').first();
    if (!stars.length) return undefined;

    const value =
        stars.find('span.full').length +
        stars.find('span.half').length * 0.5 +
        stars.find('span.quarter').length * 0.25;

    return value > 0 ? Math.round(value * 100) / 100 : undefined;
}

function readSubRatings($, $scope) {
    const ratings = {};

    $scope.find('.rankings .category').each((_, element) => {
        const $category = $(element);
        const label = cleanText($category.text());
        const value = Number.parseFloat(cleanText($category.next('.value').text()));
        if (!label || !Number.isFinite(value)) return;
        ratings[toSnakeCase(label)] = value;
    });

    return ratings;
}

function readLocation($, $scope) {
    const linked = cleanText($scope.find('.rating-container a[href*="l="]').first().text());
    if (linked) return linked;

    const labels = [
        $scope.find('.rating-container .header13').first().text(),
        $scope.find('.spotlight-date').first().text(),
    ];

    for (const label of labels) {
        const match = cleanText(label)?.match(/\bin\s+(.+)$/i);
        if (match) return cleanText(match[1]);
    }

    return undefined;
}

function readCompanyName($, pageUrl) {
    const title = cleanText($('title').text());
    const fromTitle = title?.match(/^is\s+(.+?)\s+a good company/i);
    if (fromTitle) return cleanText(fromTitle[1]);

    const slug = new URL(pageUrl).pathname.split('/').filter(Boolean)[0];
    if (!slug) return undefined;

    return slug
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function readAggregateRating(nodes) {
    for (const node of nodes) {
        if (!hasType(node, 'EmployerAggregateRating')) continue;

        const aggregateRating = toNumber(node.ratingValue);
        const aggregateReviewCount = toNumber(node.ratingCount ?? node.reviewCount);

        return cleanObject({
            aggregate_rating: aggregateRating,
            aggregate_review_count: aggregateReviewCount,
            company_name: cleanText(node.itemReviewed?.name),
        });
    }

    return undefined;
}

function readAggregateFallback($) {
    const description = cleanText($('meta[name="description"]').attr('content'));
    const match = description?.match(/rated\s+([\d.]+)\s+out of 5 by\s+([\d,]+)/i);
    if (!match) return undefined;

    return cleanObject({
        aggregate_rating: toNumber(match[1]),
        aggregate_review_count: toNumber(match[2].replace(/,/g, '')),
    });
}

function readStructuredReviews(nodes) {
    return nodes
        .filter((node) => hasType(node, 'Review'))
        .map((node) =>
            cleanObject({
                review_text: stripWrappingQuotes(cleanText(node.reviewBody ?? node.description)),
                rating: toNumber(node.reviewRating?.ratingValue),
                company_name: cleanText(node.itemReviewed?.name),
                job_title: cleanText(node.author?.name),
            }),
        )
        .filter((review) => Boolean(review.review_text));
}

function readJsonLdBlocks($) {
    const blocks = [];

    $('script[type="application/ld+json"]').each((_, element) => {
        const raw = $(element).text();
        if (!raw) return;
        try {
            blocks.push(JSON.parse(raw));
        } catch {
            // A malformed structured-data block must never stop extraction.
        }
    });

    return blocks;
}

function flattenJsonLd(value, output = []) {
    if (Array.isArray(value)) {
        for (const entry of value) flattenJsonLd(entry, output);
        return output;
    }
    if (!value || typeof value !== 'object') return output;

    output.push(value);
    if (value['@graph']) flattenJsonLd(value['@graph'], output);

    return output;
}

function hasType(node, type) {
    const nodeType = node?.['@type'];
    return Array.isArray(nodeType) ? nodeType.includes(type) : nodeType === type;
}

function looksLikeChallenge(html) {
    if (hasReviewMarkup(html)) return false;
    return CHALLENGE_MARKERS.some((pattern) => pattern.test(html));
}

function looksLikeReviewPage(html) {
    return hasReviewMarkup(html) || /careerbliss\.com/i.test(html);
}

function hasReviewMarkup(html) {
    return REVIEW_MARKERS.some((pattern) => pattern.test(html));
}

function readRetryAfter(response) {
    const raw = response.headers?.get?.('retry-after');
    if (!raw) return undefined;

    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_AFTER_MS);

    const date = Date.parse(raw);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);

    return undefined;
}

function backoffDelay(attempt) {
    const base = Math.min(700 * 2 ** attempt, MAX_BACKOFF_MS);
    return base + Math.floor(Math.random() * 400);
}

function toSessionId(runId, counter) {
    const prefix = String(runId ?? 'run').replace(/[^\w.~]/g, '_');
    return `${prefix}_${counter}`;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function absoluteUrl(href, baseUrl) {
    try {
        return new URL(href, baseUrl).toString();
    } catch {
        return undefined;
    }
}

function readHashFragment(href) {
    const hash = String(href).split('#')[1];
    return hash && /^\d+$/.test(hash) ? hash : undefined;
}

function reviewTextKey(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function hashId(parts) {
    return crypto
        .createHash('sha1')
        .update(parts.map((part) => String(part ?? '')).join('|'))
        .digest('hex');
}

function stripWrappingQuotes(text) {
    if (!text) return text;

    let output = text;
    while (output.length > 1 && /^["“”]/.test(output) && /["“”]$/.test(output)) {
        output = output.slice(1, -1).trim();
    }

    return output;
}

function cleanText(value) {
    if (typeof value !== 'string') return undefined;
    const text = value.replace(/\s+/g, ' ').trim();
    return text || undefined;
}

function toSnakeCase(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return undefined;
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? number : undefined;
}

function countFilled(object) {
    return Object.values(object).filter((value) => value !== undefined && value !== null && value !== '').length;
}

function cleanObject(object) {
    const output = {};

    for (const [key, value] of Object.entries(object)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && !value.trim()) continue;
        if (typeof value === 'number' && !Number.isFinite(value)) continue;
        output[key] = value;
    }

    return output;
}
