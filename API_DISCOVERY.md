# API Discovery

Discovery date: 2026-11-04. Re-verify before changing the request path.

## Selected source

- Endpoint: `https://www.careerbliss.com/{company-slug}/reviews/`
- Method: `GET`
- Response: server-rendered HTML with review cards and JSON-LD blocks
- Auth: none. No cookies, tokens, API keys, or login flow required
- Pagination: `?page=N` (page 1 is the bare URL, page 2 and up append `page`)
- Filters: `?l=` (location) and `?jtid=` (job title) are preserved between pages
- Fields available: review id, company, job title, location, rating, review text, review URL, eight workplace sub-ratings, company aggregate rating, company rating count
- Fields in the current output: all of the above

There is no public JSON endpoint for reviews. The page contains no review XHR: review data is rendered on the server. The only JSON-shaped data on the page is JSON-LD (`EmployerAggregateRating`, `Review[]`, `BreadcrumbList`).

## Candidate matrix

| Candidate                                                                                                                                                                  | Result                                      | Decision                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Plain Node `fetch`                                                                                                                                                         | `403` Cloudflare challenge page             | Rejected                                               |
| Impit `chrome`, `chrome100`, `chrome101`, `chrome104`, `chrome107`, `chrome110`, `chrome116`, `chrome124`, `chrome125`, `chrome131`, `chrome136`, `chrome142`, `chrome151` | `200`, 15 review cards                      | Selected                                               |
| Impit `firefox`, `firefox128`, `firefox133`, `firefox135`, `firefox144`, `firefox158`                                                                                      | `200`, 15 review cards                      | Kept as fallbacks                                      |
| Impit `ios18`                                                                                                                                                              | `200`, 15 review cards                      | Kept as fallback                                       |
| Impit `okhttp`, `okhttp3`, `okhttp4`, `okhttp5`                                                                                                                            | `403` (153-byte body)                       | Rejected                                               |
| Every passing profile from an Apify cloud data-center IP                                                                                                                   | `403`                                       | Proxy required in the cloud                            |
| Apify Proxy (data center) plus `chrome`                                                                                                                                    | `200`, review markup                        | Selected cloud path                                    |
| Headless browser                                                                                                                                                           | `200`, but 250 KB+ DOM with ads and scripts | Unnecessary; HTTP is enough                            |
| Review detail pages                                                                                                                                                        | `200`, add a relative date and salary note  | Rejected as a per-review request; too many extra calls |

20 of 24 tested profiles pass. The four Android profiles are rejected, so they are excluded from the rotation pool.

Rotation pool, newest first: `chrome`, `chrome151`, `chrome142`, `chrome136`, `chrome131`, `firefox158`, `firefox144`, `firefox135`, `ios18`. A profile that succeeds becomes the preferred fingerprint for later pages in the same run.

Re-run the matrix after a failure:

```bash
node tools/check-profiles.mjs
node tools/check-profiles.mjs https://www.careerbliss.com/cisco-systems/reviews/
```

## Request pattern

- One `Impit` client per fingerprint/proxy pair, reused across pages.
- No manual `user-agent`, `accept`, `accept-language`, or `sec-ch-*` headers. The selected profile supplies a coherent set. Adding invented browser headers can desynchronise the TLS fingerprint and the headers.
- No cookies are sent or needed.
- Request timeout: 45 s. Sequential page requests.
- Proxy is on by default. Cloud runs from Apify data-center IPs return `403` on every profile without it, and Apify Proxy passes. A local residential connection works without a proxy.
- Proxy session ids must match `^[\w._~]+$`; the actor derives them from the run id with dashes replaced by underscores.

## Response structure

Regular card:

```html
<div class="company-reviews">
    <a
        class="job-title"
        href="/cisco-systems/reviews/duty-manager/#2084793"
        data-reviewid="2084793"
        data-company="Cisco Systems"
        data-jobtitle="Duty Manager"
        >Duty Manager</a
    >
    <div class="rating-container">
        <div class="rating large-star"><span class="full"></span>…</div>
        <span class="header13">in <a href="?l=Morrisville%2C%20NC">Morrisville, NC</a></span>
    </div>
    <p class="comments foggy">"…review text…"</p>
    <div class="rankings">
        <span class="category">Person You Work For</span><span class="value">4 / 5</span>
        …
    </div>
</div>
```

Featured card uses `.spotlight-container a` plus `.review em` and `.spotlight-date`, and repeats a review that also appears in the list. Deduplication by `review_id` keeps one copy.

Job-title filtered pages render the job title as a `<span data-reviewid=…>` instead of a link and omit the aggregate JSON-LD. The parser reads identifiers from `[data-reviewid]`, so both shapes work.

Precise ratings come from JSON-LD `Review[].reviewRating.ratingValue` matched by review text. The star row is only a fallback and resolves to quarter-star precision.

## Pagination behaviour

- Page 1: bare URL with any filter preserved.
- Page N: same URL plus `page=N`.
- 15 regular reviews per page, plus one rotating featured review.
- Out-of-range pages keep returning duplicated content instead of 404, so the Actor stops when a page repeats the previous page or two pages add nothing new.
- `996` in `ratingCount` is the number of ratings, not the number of pages. Pagination continues well past `ratingCount / 15`.
- A non-existent company returns `404`. A company overview URL (`/{slug}/`) is rewritten to `/{slug}/reviews/`.

## Failure diagnosis order

1. Read this file.
2. Confirm the actor still uses `Impit` with a profile from the passing set and does not override browser headers.
3. Run `node tools/check-profiles.mjs`. If all profiles return `403` or a challenge page, the network location is blocked: enable Apify Proxy (residential) and retry.
4. Fetch one page with the probe to see whether the HTML still contains `data-reviewid`, `.company-reviews`, and JSON-LD `Review` nodes.
5. If the markup moved, update the selectors in `readReviewCard` and keep the JSON-LD fallback working.
6. If the page returns `200` without reviews, check whether the listing switched to a JavaScript-only or load-more model. That would require a browser-based path.
7. If requests succeed but ratings or locations are missing, check the JSON-LD `Review` text matching and the `.rankings` markup.

## Known limits

- No review date on listing pages; detail pages show only relative dates ("Posted 5 years ago"), so no date field is produced.
- No pros/cons split on listing pages.
- Aggregate rating and count are omitted on job-title filtered pages because the page does not publish them.
- Cloudflare blocks the plain Node TLS fingerprint. Any future client change must keep a browser-like TLS profile.
