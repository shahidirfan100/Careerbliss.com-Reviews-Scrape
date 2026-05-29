# CareerBliss Reviews Scraper

Extract CareerBliss employee review data from company review pages at scale. Collect review text, rating details, and company-level rating context in a clean dataset. Ideal for employer research, sentiment analysis, and review monitoring workflows.

## Features

- **Company review extraction** - Collect employee reviews from CareerBliss company review URLs.
- **Pagination support** - Automatically scans multiple review pages per input URL.
- **Multi-URL runs** - Process one or many company URLs in a single run.
- **Structured output** - Returns normalized review records with stable review IDs.
- **Dataset-ready results** - Export to JSON, CSV, Excel, or use directly in automations.

## Use Cases

### Employer Research
Analyze real employee feedback before applying, interviewing, or building employer comparison reports.

### Market Intelligence
Track how companies are perceived over time and compare sentiment across competitors in the same industry.

### Review Monitoring
Run on a schedule and monitor changes in employee feedback and rating trends for target companies.

### Analytics Pipelines
Feed review datasets into BI dashboards, LLM workflows, and internal reporting systems.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | Array | No | `["https://www.careerbliss.com/cisco-systems/reviews/"]` | One or more CareerBliss company URLs or review URLs. |
| `results_wanted` | Integer | No | `20` | Maximum number of review items to save. |
| `max_pages` | Integer | No | `20` | Maximum pages to scan for each input URL. |
| `proxyConfiguration` | Object | No | `{ "useApifyProxy": false }` | Optional proxy configuration. |

---

## Output Data

Each dataset item contains:

| Field | Type | Description |
|-------|------|-------------|
| `review_id` | String | Stable unique ID for each review record. |
| `company_name` | String | Company name from the review page. |
| `job_title` | String | Reviewer job title label. |
| `rating` | Number | Review rating value. |
| `review_text` | String | Employee review text. |
| `source_url` | String | Review page URL where the record was extracted. |
| `aggregate_rating` | Number | Overall company rating shown on the source page. |
| `aggregate_review_count` | Number | Total company review count shown on the source page. |

---

## Usage Examples

### Single Company Reviews

```json
{
  "urls": [
    "https://www.careerbliss.com/cisco-systems/reviews/"
  ],
  "results_wanted": 50
}
```

### Multiple Companies

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

### Reviews by Location Filter URL

```json
{
  "urls": [
    "https://www.careerbliss.com/cisco-systems/reviews/?l=San%20Jose%2C%20CA"
  ],
  "results_wanted": 40,
  "max_pages": 8
}
```

---

## Sample Output

```json
{
  "review_id": "a2d8592f2fcb5ea5cd44dce928ba496a29f8f9de",
  "company_name": "Cisco Systems",
  "job_title": "Duty Manager",
  "rating": 4.6,
  "review_text": "Cisco is a great place to work and offers many perks.",
  "source_url": "https://www.careerbliss.com/cisco-systems/reviews/",
  "aggregate_rating": 4.1,
  "aggregate_review_count": 1249
}
```

---

## Tips for Best Results

### Use Company-Specific Review URLs
- Prefer direct company review URLs for the most relevant results.
- You can also provide company overview URLs; they will be resolved automatically.

### Start Small, Then Scale
- Use `results_wanted: 20` for quick checks.
- Increase limits after validating output quality for your target companies.

### Tune Pagination
- If a company has many reviews, increase `max_pages`.
- Keep limits balanced to avoid collecting more data than needed.

### Proxy Usage
- If you run larger jobs, configure a proxy for more stable collection.

---

## Integrations

Connect your data with:

- **Google Sheets** - Build shareable review reports.
- **Airtable** - Store and search review records.
- **Slack** - Notify teams on scheduled runs.
- **Webhooks** - Send results to your own backend.
- **Make** - Build automation scenarios.
- **Zapier** - Trigger business workflows.

### Export Formats

- **JSON** - Developer-friendly structured output.
- **CSV** - Spreadsheet and tabular workflows.
- **Excel** - Business reporting and sharing.
- **XML** - System integration workflows.

---

## Frequently Asked Questions

### Can I scrape multiple companies in one run?
Yes. Add multiple URLs to the `urls` array.

### Does it support pagination?
Yes. It scans pages until limits are reached or no new reviews are found.

### What if some fields are missing?
Only available fields are returned. Empty/null fields are not included in output.

### Can I control how much data is collected?
Yes. Use `results_wanted` and `max_pages` to control run size.

### Can I schedule this scraper?
Yes. You can schedule it in Apify and send results to your preferred destination.

---

## Support

For issues or feature requests, use the Apify Console issue/report channels for this actor.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection and analysis. You are responsible for complying with website terms of service and all applicable laws in your jurisdiction.
