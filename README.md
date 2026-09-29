## What does CareerBliss Reviews Scraper do?

CareerBliss Reviews Scraper collects employee reviews from CareerBliss company review pages. Provide one or more company URLs and get a dataset with review text, ratings, company names, reviewer job-title labels, and company-level rating context when CareerBliss publishes it. Use the results for employer research, sentiment analysis, company comparisons, and recurring review monitoring.

You can start with a company review page or a company overview URL. The Actor can process several companies in one run, follow review pages up to your page limit, remove duplicate reviews within the run, and save each review as its own dataset item. The result limit applies across all URLs in that run.

## Why use CareerBliss Reviews Scraper?

- **Compare employers** - Review company feedback and ratings in a spreadsheet or analytics workflow.
- **Research workplace sentiment** - Work with review text and scores without copying entries by hand.
- **Monitor changes** - Schedule repeat runs for a company list and compare the collected datasets over time.
- **Process multiple companies** - Submit a URL list and use one result limit for the whole run.
- **Connect the data** - Export the dataset or pass it to Apify integrations, webhooks, and API workflows.

## What data can CareerBliss Reviews Scraper extract?

Each dataset item represents one review. CareerBliss may omit fields that are not present on the source page.

| Field | Type | Description |
|-------|------|-------------|
| `review_id` | String | Generated identifier for the review record. |
| `company_name` | String | Company name shown with the review. |
| `job_title` | String | Reviewer job-title label shown on the source page. |
| `rating` | Number | Rating attached to the review, when available. |
| `review_text` | String | Employee review text. |
| `source_url` | String | CareerBliss review page used for the record. |
| `aggregate_rating` | Number | Overall company rating shown on the page, when available. |
| `aggregate_review_count` | Number | Company review count shown on the page, when available. |

The output includes the review text and rating as CareerBliss provides them. It does not currently split review text into separate pros and cons fields or provide a separate review-date field.

## How to use CareerBliss Reviews Scraper

1. Open the Actor in Apify Console.
2. Enter one or more CareerBliss company review URLs in `urls`. A company overview URL is also accepted and is resolved to that company's reviews page.
3. Set `results_wanted` for the maximum number of review records to save across the run.
4. Set `max_pages` to cap how many review pages the Actor scans for each URL.
5. Start the run, review the dataset, then export it or connect it to your workflow.

The Actor stops scanning a URL when it reaches the page limit or finds no new reviews. If you provide multiple URLs, it processes them in order until the run-wide result limit is reached.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | Array of strings | No | Cisco Systems review page | One or more CareerBliss company overview or review URLs. If omitted, the Actor uses its Cisco Systems starting URL. |
| `results_wanted` | Integer | No | `20` | Maximum number of review records to save across all input URLs. |
| `max_pages` | Integer | No | `20` | Maximum review pages to scan for each input URL. |
| `proxyConfiguration` | Object | No | Apify Proxy disabled | Optional Apify Proxy settings for the run. |

## Usage Examples

### Collect reviews from one company

Start with one review page and save up to 50 review records:

```json
{
  "urls": [
    "https://www.careerbliss.com/cisco-systems/reviews/"
  ],
  "results_wanted": 50,
  "max_pages": 10
}
```

### Collect reviews from several companies

Add multiple company pages to one run. The `results_wanted` value is the combined limit across the URL list:

```json
{
  "urls": [
    "https://www.careerbliss.com/cisco-systems/reviews/",
    "https://www.careerbliss.com/intel/reviews/"
  ],
  "results_wanted": 100,
  "max_pages": 10
}
```

### Use Apify Proxy

Enable Apify Proxy for a larger or recurring collection when proxy routing is needed:

```json
{
  "urls": [
    "https://www.careerbliss.com/cisco-systems/reviews/"
  ],
  "results_wanted": 100,
  "max_pages": 20,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

## Sample Output

This illustrative dataset item shows the output shape. Values and optional company-level fields depend on what the source page provides.

```json
{
  "review_id": "ce119e586bd866949a4c5283ce991b0cf1b954ce",
  "company_name": "Cisco Systems",
  "job_title": "Duty Manager",
  "rating": 4.6,
  "review_text": "Cisco is a great place to work and offers many perks.",
  "source_url": "https://www.careerbliss.com/cisco-systems/reviews/",
  "aggregate_rating": 4.1,
  "aggregate_review_count": 1249
}
```

## Tips for Best Results

- **Use company-specific review URLs** - A direct URL ending in `/reviews/` makes the target clear. Company overview URLs are also accepted.
- **Start with a modest result limit** - Use `results_wanted` to control the total size of a run, then increase it if you need more records.
- **Set both limits deliberately** - `results_wanted` caps saved records across the entire run; `max_pages` caps scanned pages separately for each URL.
- **Check optional fields** - Aggregate company ratings and review counts are included only when the page provides them. Some source pages may return fewer records than your configured limit.
- **Schedule comparable runs** - Reuse the same company URLs and limits when you want to compare datasets collected at different times.

## Integrations and Export Formats

Apify datasets can be downloaded in JSON, CSV, Excel, and other supported formats. You can also connect runs to:

- **Google Sheets** - Review and compare company feedback in a spreadsheet.
- **Airtable** - Maintain a searchable employer-review dataset.
- **Webhooks** - Send completed run data to your own service or pipeline.
- **Make or Zapier** - Trigger follow-up reporting and notifications.
- **Apify API** - Start runs and retrieve dataset records from another application.

## Frequently Asked Questions

### Which CareerBliss URLs can I provide?

Use a company review URL, such as `https://www.careerbliss.com/cisco-systems/reviews/`, or a company overview URL. The Actor resolves overview URLs to the company's review page.

### Can I scrape multiple companies in one run?

Yes. Add each company URL to the `urls` array. The `results_wanted` limit applies to the combined run, while `max_pages` applies to each URL.

### Does the Actor collect every review on CareerBliss?

The Actor scans pages up to `max_pages` for each URL and stops when it reaches the run-wide result limit or finds no new reviews. The number returned depends on the pages CareerBliss makes available.

### Why are some fields missing?

The Actor omits empty values. CareerBliss may not publish every rating or aggregate company field on every page.

### Can I schedule recurring runs?

Yes. Create a schedule in Apify Console to run the Actor at a chosen interval, then compare or route each dataset through your integrations.

### Is it permitted to collect CareerBliss content with this Actor?

CareerBliss's [Terms of Use](https://www.careerbliss.com/terms-of-use/) prohibit using software or agents to navigate or search its site and prohibit aggregating or copying site content without express written consent. Obtain permission and review the current terms and applicable laws before running the Actor or using its results.

## Related Actors

- [Repvue.com Reviews Scraper ⭐](https://apify.com/shahidirfan/repvue-com-reviews-scraper) - Collect employee feedback and company ratings from RepVue for additional employer-review research.
- [Naukri Jobs Scraper](https://apify.com/shahidirfan/naukri-jobs-scraper) - Add current hiring data and linked AmbitionBox company rating and review-count context when available.

## Support

For issues or feature requests, use the Issues tab on this Actor's Apify Store page. Include the input URL, run time, and affected field so the problem can be reviewed.

## Legal Notice

CareerBliss's [Terms of Use](https://www.careerbliss.com/terms-of-use/) restrict automated navigation and searching, as well as aggregating or copying site content without express written consent. Obtain the required permission before using this Actor. You are responsible for complying with the current terms, applicable laws, and privacy requirements when collecting, storing, or using any results.
