import { describe, expect, it } from 'vitest';

import { buildPageUrl, normalizeReviewRoot, parseReviewsPage } from '../src/careerbliss.js';

const pageUrl = 'https://www.careerbliss.com/acme-corp/reviews/';

function card({
    id = '101',
    title = 'Engineer',
    text = 'Good place to grow.',
    href = '/acme-corp/reviews/engineer/#101',
} = {}) {
    return `
        <div class="company-reviews">
            <a class="job-title header5" href="${href}" data-reviewid="${id}" data-company="Acme Corp" data-jobtitle="${title}">${title}</a>
            <div class="rating-container">
                <div class="rating large-star">
                    <span class="full"></span><span class="full"></span><span class="full"></span><span class="full"></span><span class="half"></span>
                </div>
                <span class="header13">in <a href="/acme-corp/reviews/?l=Austin%2C%20TX">Austin, TX</a></span>
            </div>
            <p class="comments foggy">"${text}"</p>
            <div class="rankings">
                <div class="row-fluid">
                    <span class="category">Person You Work For</span>
                    <span class="value"><span>4</span> / 5</span>
                    <span class="category">Growth Opportunities</span>
                    <span class="value"><span>3</span> / 5</span>
                </div>
            </div>
        </div>`;
}

function page(body, { aggregate = true } = {}) {
    const aggregateBlock = aggregate
        ? `<script type="application/ld+json">{"@context":"https://schema.org/","@type":"EmployerAggregateRating","itemReviewed":{"@type":"Organization","name":"Acme Corp"},"ratingValue":"4.2","ratingCount":"120"}</script>`
        : '';
    return `<!doctype html><html><head><title>Is Acme Corp a Good Company to Work For? 120 Reviews</title>
        <meta name="description" content="Acme Corp is rated 4.2 out of 5 by 120 employees.">
        ${aggregateBlock}
        <script type="application/ld+json">[{"@type":"Review","author":{"@type":"Person","name":"Engineer"},"itemReviewed":{"@type":"Organization","name":"Acme Corp"},"reviewBody":"Good place to grow.","reviewRating":{"@type":"Rating","ratingValue":"4.4"}}]</script>
        </head><body>${body}</body></html>`;
}

describe('parseReviewsPage', () => {
    it('reads card fields and takes the exact rating from structured data', () => {
        const result = parseReviewsPage(page(card()), pageUrl);

        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0]).toMatchObject({
            review_id: '101',
            company_name: 'Acme Corp',
            job_title: 'Engineer',
            rating: 4.4,
            review_text: 'Good place to grow.',
            location: 'Austin, TX',
            review_url: 'https://www.careerbliss.com/acme-corp/reviews/engineer/#101',
            source_url: pageUrl,
            person_you_work_for: 4,
            growth_opportunities: 3,
        });
        expect(result.aggregate_rating).toBe(4.2);
        expect(result.aggregate_review_count).toBe(120);
    });

    it('keeps one record when a featured card repeats a listed review', () => {
        const featured = `
            <div class="company-reviews">
                <div class="spotlight-container"><a class="header5" href="/acme-corp/reviews/engineer/#101">Engineer</a></div>
                <div class="review"><em>"Good place to grow."</em></div>
            </div>`;
        const result = parseReviewsPage(page(featured + card()), pageUrl);

        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0].person_you_work_for).toBe(4);
    });

    it('reads a job-title page where the title is a plain span, not a link', () => {
        const html = `<!doctype html><html><head>
            <title>Cisco Systems Duty Manager Reviews by 1 Employee</title>
            </head><body>
            <div class="company-reviews">
                <span class="job-title header5 black" data-reviewid="2084793" data-company="Cisco Systems" data-jobtitle="Duty Manager">Duty Manager</span>
                <div class="rating-container">
                    <div class="rating large-star"><span class="full"></span><span class="full"></span><span class="full"></span><span class="full"></span><span class="half"></span></div>
                    <span class="header13">in Morrisville, NC</span>
                </div>
                <p class="comments foggy">"Great perks."</p>
                <div class="rankings"><span class="category">Work Setting</span><span class="value"><span>5</span> / 5</span></div>
            </div></body></html>`;
        const result = parseReviewsPage(html, 'https://www.careerbliss.com/cisco-systems/reviews/duty-manager/');

        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0]).toMatchObject({
            review_id: '2084793',
            company_name: 'Cisco Systems',
            job_title: 'Duty Manager',
            location: 'Morrisville, NC',
            rating: 4.5,
            work_setting: 5,
            review_url: 'https://www.careerbliss.com/cisco-systems/reviews/duty-manager/#2084793',
        });
        expect(result.aggregate_rating).toBeUndefined();
    });

    it('finds reviews when the card class changes but identifiers remain', () => {
        const html = `<!doctype html><html><head><title>Is Acme Corp a Good Company to Work For? 12 Reviews</title></head>
            <body>
            <div class="review-card-v2">
                <span class="job-title" data-reviewid="77" data-company="Acme Corp" data-jobtitle="Analyst">Analyst</span>
                <div class="rating-container"><div class="rating large-star"><span class="full"></span><span class="full"></span><span class="full"></span><span class="full"></span></div></div>
                <p class="comments foggy">"Steady work."</p>
            </div></body></html>`;
        const result = parseReviewsPage(html, pageUrl);

        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0]).toMatchObject({
            review_id: '77',
            job_title: 'Analyst',
            review_text: 'Steady work.',
            rating: 4,
            review_url: `${pageUrl}#77`,
        });
    });

    it('falls back to structured data when card markup changes', () => {
        const result = parseReviewsPage(page('<div class="layout-v2">reviews moved elsewhere</div>'), pageUrl);

        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0]).toMatchObject({
            company_name: 'Acme Corp',
            job_title: 'Engineer',
            rating: 4.4,
            review_text: 'Good place to grow.',
        });
        expect(result.reviews[0].review_id).toMatch(/^[a-f0-9]{40}$/);
    });

    it('reads aggregate values from the page summary when structured data is missing', () => {
        const html = `<!doctype html><html><head>
            <title>Is Acme Corp a Good Company to Work For? 120 Reviews</title>
            <meta name="description" content="Acme Corp is rated 4.2 out of 5 by 1,249 employees.">
            </head><body>${card()}</body></html>`;
        const result = parseReviewsPage(html, pageUrl);

        expect(result.aggregate_rating).toBe(4.2);
        expect(result.aggregate_review_count).toBe(1249);
    });

    it('ignores malformed structured data and keeps the card records', () => {
        const html = `<!doctype html><html><head><script type="application/ld+json">{not json}</script></head>
            <body>${card()}</body></html>`;
        const result = parseReviewsPage(html, pageUrl);

        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0].rating).toBe(4.5);
    });
});

describe('normalizeReviewRoot', () => {
    it('turns a company overview URL into its review listing', () => {
        expect(normalizeReviewRoot('careerbliss.com/acme-corp/')).toBe(
            'https://www.careerbliss.com/acme-corp/reviews/',
        );
    });

    it('keeps a job-title review scope and drops the page parameter', () => {
        expect(normalizeReviewRoot('https://www.careerbliss.com/acme-corp/reviews/engineer/?page=4#top')).toBe(
            'https://www.careerbliss.com/acme-corp/reviews/engineer/',
        );
    });

    it('rejects URLs from other sites', () => {
        expect(() => normalizeReviewRoot('https://example.com/acme-corp/reviews/')).toThrow(/careerbliss\.com/);
    });
});

describe('buildPageUrl', () => {
    it('requests the first page without a page parameter', () => {
        expect(buildPageUrl('https://www.careerbliss.com/acme-corp/reviews/?l=Austin%2C+TX', 1)).toBe(
            'https://www.careerbliss.com/acme-corp/reviews/?l=Austin%2C+TX',
        );
    });

    it('sets the page number and keeps location filters', () => {
        expect(buildPageUrl('https://www.careerbliss.com/acme-corp/reviews/?l=Austin%2C+TX', 3)).toBe(
            'https://www.careerbliss.com/acme-corp/reviews/?l=Austin%2C+TX&page=3',
        );
    });
});
