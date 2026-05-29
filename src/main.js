import crypto from 'node:crypto';

import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';

const DEFAULT_URL = 'https://www.careerbliss.com/cisco-systems/reviews/';
const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 20;

await Actor.init();

const input = (await Actor.getInput()) || {};
const {
    urls,
    url,
    startUrl,
    startUrls,
    results_wanted: resultsWantedRaw = DEFAULT_RESULTS_WANTED,
    max_pages: maxPagesRaw = DEFAULT_MAX_PAGES,
    proxyConfiguration,
} = input;

const resultsWanted = toPositiveInt(resultsWantedRaw, DEFAULT_RESULTS_WANTED);
const maxPages = toPositiveInt(maxPagesRaw, DEFAULT_MAX_PAGES);

const inputUrls = collectInputUrls({ urls, url, startUrl, startUrls });
const normalizedRoots = inputUrls.map(normalizeCareerBlissReviewsUrl);

const proxy = proxyConfiguration
    ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
    : undefined;

const seenReviewIds = new Set();
let totalSaved = 0;

for (const rootUrl of normalizedRoots) {
    for (let page = 0; page < maxPages; page++) {
        if (totalSaved >= resultsWanted) break;

        const pageUrl = buildPaginatedUrl(rootUrl, page);
        const html = await fetchPage(pageUrl, proxy);
        const parsed = extractReviewsFromJsonLd(html, pageUrl);
        const aggregate = extractAggregateRating(html);

        if (!parsed.length) {
            log.info(`No review JSON found on page ${page + 1}; stopping pagination for this input URL.`);
            break;
        }

        let newItemsOnPage = 0;

        for (const review of parsed) {
            if (totalSaved >= resultsWanted) break;
            if (seenReviewIds.has(review.review_id)) continue;

            seenReviewIds.add(review.review_id);
            newItemsOnPage++;

            const item = cleanObject({
                ...review,
                aggregate_rating: aggregate?.aggregate_rating,
                aggregate_review_count: aggregate?.aggregate_review_count,
            });

            await Actor.pushData(item);
            totalSaved++;
        }

        log.info(
            `Processed page ${page + 1} -> extracted ${parsed.length}, new ${newItemsOnPage}, total saved ${totalSaved}/${resultsWanted}.`,
        );

        if (newItemsOnPage === 0) {
            log.info(`No new reviews on page ${page + 1}; stopping pagination for this input URL.`);
            break;
        }
    }
}

log.info(`Finished. Saved ${totalSaved} review item(s).`);
await Actor.exit();

function toPositiveInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

function collectInputUrls(inputData) {
    const collected = [];

    if (Array.isArray(inputData.urls)) collected.push(...inputData.urls);
    if (typeof inputData.url === 'string') collected.push(inputData.url);
    if (typeof inputData.startUrl === 'string') collected.push(inputData.startUrl);
    if (Array.isArray(inputData.startUrls)) collected.push(...inputData.startUrls);

    const cleaned = collected
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean);

    return cleaned.length ? cleaned : [DEFAULT_URL];
}

function normalizeCareerBlissReviewsUrl(rawUrl) {
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsed = new URL(withProtocol);

    if (!/careerbliss\.com$/i.test(parsed.hostname)) {
        throw new Error(`URL must be on careerbliss.com: ${rawUrl}`);
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const hasReviewsSegment = segments.some((seg) => seg.toLowerCase() === 'reviews');

    if (!hasReviewsSegment) {
        if (!segments.length) {
            throw new Error(`Cannot infer company slug from URL: ${rawUrl}`);
        }
        parsed.pathname = `/${segments[0]}/reviews/`;
    } else if (!parsed.pathname.endsWith('/')) {
        parsed.pathname = `${parsed.pathname}/`;
    }

    parsed.hash = '';
    parsed.searchParams.delete('page');

    return parsed;
}

function buildPaginatedUrl(baseUrl, pageNumber) {
    const pageUrl = new URL(baseUrl.toString());

    if (pageNumber > 0) pageUrl.searchParams.set('page', String(pageNumber));
    else pageUrl.searchParams.delete('page');

    return pageUrl.toString();
}

async function fetchPage(pageUrl, proxyConf) {
    const maxAttempts = 4;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const proxyUrl = proxyConf ? await proxyConf.newUrl(`careerbliss-${attempt}`) : undefined;

            const response = await gotScraping({
                url: pageUrl,
                proxyUrl,
                timeout: { request: 30000 },
                retry: { limit: 0 },
                headers: {
                    'user-agent': getRandomUserAgent(),
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.9',
                },
            });

            return response.body;
        } catch (error) {
            lastError = error;
            const delayMs = 500 * attempt;
            log.warning(`Fetch failed (attempt ${attempt}/${maxAttempts}): ${error.message}`);
            await Actor.utils.sleep(delayMs);
        }
    }

    throw new Error(`Failed to fetch page after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
}

function extractJsonLdBlocks(html) {
    const blocks = [];
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match = regex.exec(html);

    while (match) {
        const raw = String(match[1] || '').trim();
        if (raw) blocks.push(raw);
        match = regex.exec(html);
    }

    return blocks;
}

function extractReviewsFromJsonLd(html, sourceUrl) {
    const blocks = extractJsonLdBlocks(html);
    const reviews = [];

    for (const block of blocks) {
        let parsed;
        try {
            parsed = JSON.parse(block);
        } catch {
            continue;
        }

        const queue = Array.isArray(parsed) ? [...parsed] : [parsed];

        while (queue.length) {
            const node = queue.shift();
            if (!node || typeof node !== 'object') continue;

            if (Array.isArray(node)) {
                queue.push(...node);
                continue;
            }

            if (node['@type'] === 'Review') {
                const item = mapReview(node, sourceUrl);
                if (item) reviews.push(item);
            }

            if (Array.isArray(node.itemListElement)) queue.push(...node.itemListElement);
            if (node.item) queue.push(node.item);
            if (Array.isArray(node.review)) queue.push(...node.review);
            else if (node.review && typeof node.review === 'object') queue.push(node.review);
        }
    }

    return reviews;
}

function mapReview(reviewNode, sourceUrl) {
    const company = safeText(reviewNode.itemReviewed?.name);
    const jobTitle = safeText(reviewNode.author?.name);
    const reviewText = safeText(reviewNode.reviewBody);
    const ratingRaw = reviewNode.reviewRating?.ratingValue;
    const rating = Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : undefined;

    if (!reviewText) return null;

    const reviewKey = `${company || ''}|${jobTitle || ''}|${reviewText}|${rating || ''}`;
    const reviewId = crypto.createHash('sha1').update(reviewKey).digest('hex');

    return cleanObject({
        review_id: reviewId,
        company_name: company,
        job_title: jobTitle,
        rating,
        review_text: reviewText,
        source_url: sourceUrl,
    });
}

function extractAggregateRating(html) {
    const blocks = extractJsonLdBlocks(html);

    for (const block of blocks) {
        let parsed;
        try {
            parsed = JSON.parse(block);
        } catch {
            continue;
        }

        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of list) {
            if (!node || typeof node !== 'object') continue;
            if (node['@type'] !== 'EmployerAggregateRating') continue;

            const aggregateRating = Number.isFinite(Number(node.ratingValue)) ? Number(node.ratingValue) : undefined;
            const aggregateReviewCount = Number.isFinite(Number(node.ratingCount)) ? Number(node.ratingCount) : undefined;

            return cleanObject({
                aggregate_rating: aggregateRating,
                aggregate_review_count: aggregateReviewCount,
            });
        }
    }

    return null;
}

function cleanObject(obj) {
    const output = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && !value.trim()) continue;
        if (Array.isArray(value) && value.length === 0) continue;
        output[key] = value;
    }

    return output;
}

function safeText(value) {
    if (typeof value !== 'string') return undefined;
    const text = value.replace(/\s+/g, ' ').trim();
    return text || undefined;
}

function getRandomUserAgent() {
    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}
