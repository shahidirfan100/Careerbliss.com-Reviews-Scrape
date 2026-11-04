import { Actor, log } from 'apify';

import {
    buildPageUrl,
    createPageFetcher,
    DEFAULT_START_URL,
    normalizeReviewRoot,
    parseReviewsPage,
} from './careerbliss.js';

const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 20;

await Actor.init();

let exitCode = 0;
try {
    await runActor();
} catch (error) {
    log.error(`Run failed: ${error?.message || error}`);
    exitCode = 1;
}

await Actor.exit({ exitCode });

async function runActor() {
    const input = (await Actor.getInput()) ?? {};
    const resultsWanted = toPositiveInt(input.results_wanted, DEFAULT_RESULTS_WANTED);
    const maxPages = toPositiveInt(input.max_pages, DEFAULT_MAX_PAGES);
    const roots = collectRootUrls(input);
    const proxyConfiguration = await createProxyConfiguration(input.proxyConfiguration);

    log.info(`Start run | urls=${roots.length} | results_wanted=${resultsWanted} | max_pages=${maxPages}`);

    const fetcher = createPageFetcher({
        proxyConfiguration,
        runId: Actor.getEnv()?.actorRunId || 'local',
    });

    const seenReviewIds = new Set();
    const failures = [];
    let totalSaved = 0;
    let pagesFetched = 0;

    for (const rootUrl of roots) {
        if (totalSaved >= resultsWanted) break;

        let emptyPagesInRow = 0;
        let previousPageSignature;

        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
            if (totalSaved >= resultsWanted) break;

            const pageUrl = buildPageUrl(rootUrl, pageNumber);
            let html;

            try {
                html = await fetcher(pageUrl);
            } catch (error) {
                failures.push({ url: pageUrl, reason: error?.message || String(error) });
                log.warning(`Stopping ${rootUrl}: ${error?.message || error}`);
                break;
            }

            if (html === null) {
                if (pageNumber === 1) {
                    const reason = `Page not found (${pageUrl}).`;
                    failures.push({ url: pageUrl, reason });
                    log.warning(reason);
                } else {
                    log.info(`Page ${pageNumber} does not exist; stopping ${rootUrl}.`);
                }
                break;
            }

            pagesFetched += 1;

            const parsed = parseReviewsPage(html, pageUrl);

            if (!parsed.reviews.length) {
                const reason = `No reviews found on page ${pageNumber} (${pageUrl}).`;
                if (pageNumber === 1) {
                    failures.push({ url: pageUrl, reason });
                    log.warning(`${reason} The page layout may have changed.`);
                } else {
                    log.info(`No more reviews after page ${pageNumber - 1}; stopping ${rootUrl}.`);
                }
                break;
            }

            const pageSignature = parsed.reviews.map((review) => review.review_id).join(',');
            if (previousPageSignature && pageSignature === previousPageSignature) {
                log.info(`Page ${pageNumber} repeats the previous page; stopping ${rootUrl}.`);
                break;
            }
            previousPageSignature = pageSignature;

            const batch = [];

            for (const review of parsed.reviews) {
                if (totalSaved + batch.length >= resultsWanted) break;
                if (seenReviewIds.has(review.review_id)) continue;

                seenReviewIds.add(review.review_id);
                batch.push({
                    ...review,
                    aggregate_rating: parsed.aggregate_rating,
                    aggregate_review_count: parsed.aggregate_review_count,
                });
            }

            if (batch.length) {
                await Actor.pushData(batch);
                totalSaved += batch.length;
            }

            log.info(
                `Page ${pageNumber}: ${parsed.reviews.length} reviews, ${batch.length} new, ` +
                    `${totalSaved}/${resultsWanted} saved.`,
            );

            if (batch.length === 0) {
                emptyPagesInRow += 1;
                if (emptyPagesInRow >= 2) {
                    log.info(`Two pages without new reviews; stopping ${rootUrl}.`);
                    break;
                }
            } else {
                emptyPagesInRow = 0;
            }
        }
    }

    log.info(`Done | saved=${totalSaved} | pages_fetched=${pagesFetched} | failed_sources=${failures.length}`);

    if (totalSaved === 0) {
        const detail = failures.length ? ` First failure: ${failures[0].reason}` : ' No reviews matched the input.';
        throw new Error(`No reviews were saved.${detail}`);
    }
}

function collectRootUrls(input) {
    const rawUrls = [
        ...(Array.isArray(input.urls) ? input.urls : []),
        ...(Array.isArray(input.startUrls) ? input.startUrls : []),
        input.url,
        input.startUrl,
    ]
        .map((item) => (typeof item === 'string' ? item : item?.url))
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);

    if (!rawUrls.length) return [DEFAULT_START_URL];

    const roots = [];
    for (const rawUrl of rawUrls) {
        try {
            const root = normalizeReviewRoot(rawUrl);
            if (!roots.includes(root)) roots.push(root);
        } catch (error) {
            log.warning(`Skipping URL (${rawUrl}): ${error.message}`);
        }
    }

    if (!roots.length) throw new Error('None of the supplied URLs point to a CareerBliss company page.');

    return roots;
}

async function createProxyConfiguration(proxyConfiguration) {
    const usesApifyProxy = Boolean(proxyConfiguration?.useApifyProxy);
    const hasCustomProxyUrls = Array.isArray(proxyConfiguration?.proxyUrls) && proxyConfiguration.proxyUrls.length > 0;

    if (!usesApifyProxy && !hasCustomProxyUrls) return undefined;

    if (usesApifyProxy && !Actor.isAtHome()) {
        log.warning('Apify Proxy needs a platform run; continuing without it in this local run.');
        if (!hasCustomProxyUrls) return undefined;
    }

    return Actor.createProxyConfiguration(proxyConfiguration);
}

function toPositiveInt(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(1, Math.floor(number));
}
