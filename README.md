## What does CareerBliss Reviews Scraper do?

CareerBliss Reviews Scraper collects employee reviews from CareerBliss company pages and saves them as a structured dataset. Give it one or more company URLs and it returns the review text, star rating, job title, location, review link, and the eight workplace scores that CareerBliss prints with each review.

Use the dataset for employer research, sentiment analysis, company comparison, or scheduled review monitoring. The Actor accepts a company overview URL or a review listing URL, follows the review pages up to your limit, removes duplicate reviews, and saves each review as a separate dataset item.

## Why use CareerBliss Reviews Scraper?

- **Build a review dataset without manual copying** - Collect hundreds of reviews from a company page and download them in one file.
- **Compare employers on the same fields** - Every review carries the same rating and workplace score fields, which makes side-by-side comparison practical.
- **Monitor how reviews change** - Schedule repeat runs for the same company list and compare the datasets over time.
- **Cover several companies in one run** - Pass a URL list and use a single result limit for the whole run.
- **Keep the source link** - Each item includes the review URL and the listing page it came from, so you can check the original entry.
- **Use the output in other tools** - Send the dataset to Google Sheets, Airtable, a webhook, or your own application through the Apify API.

## What data can you extract from CareerBliss?

Each dataset item is one review. CareerBliss does not print every field on every page, so optional values are omitted when the page does not provide them.

| Field                    | Type   | Description                                            |
| ------------------------ | ------ | ------------------------------------------------------ |
| `review_id`              | String | Review identifier from the CareerBliss page.           |
| `company_name`           | String | Company the review belongs to.                         |
| `job_title`              | String | Job title shown for the reviewer.                      |
| `location`               | String | Reviewer location, such as `San Jose, CA`.             |
| `rating`                 | Number | Overall rating from 1 to 5, including decimals.        |
| `review_text`            | String | Full review text as published.                         |
| `review_url`             | String | Direct link to the review entry.                       |
| `source_url`             | String | Listing page where the review was found.               |
| `person_you_work_for`    | Number | Workplace score from 1 to 5.                           |
| `people_you_work_with`   | Number | Workplace score from 1 to 5.                           |
| `work_setting`           | Number | Workplace score from 1 to 5.                           |
| `support_you_get`        | Number | Workplace score from 1 to 5.                           |
| `rewards_you_receive`    | Number | Workplace score from 1 to 5.                           |
| `growth_opportunities`   | Number | Workplace score from 1 to 5.                           |
| `company_culture`        | Number | Workplace score from 1 to 5.                           |
| `way_you_work`           | Number | Workplace score from 1 to 5.                           |
| `aggregate_rating`       | Number | Company rating shown on the listing page.              |
| `aggregate_review_count` | Number | Rating count published by CareerBliss for the company. |

CareerBliss listing pages do not show a review date, and they do not separate pros from cons. The Actor does not invent those values.

## How to use CareerBliss Reviews Scraper

1. Open the Actor in Apify Console.
2. Add one or more CareerBliss URLs to `urls`. A company page such as `https://www.careerbliss.com/cisco-systems/` and a review page such as `https://www.careerbliss.com/cisco-systems/reviews/` both work.
3. Set `results_wanted` for the total number of reviews you need.
4. Set `max_pages` to cap how many review pages the Actor scans for each URL.
5. Start the run and open the dataset when it finishes.
6. Download the dataset or connect it to a spreadsheet, webhook, or API workflow.

The Actor stops a URL when it reaches the page limit, runs out of new reviews, or when the run-wide result limit is reached.

## Input Parameters

| Parameter            | Type             | Required | Default                   | Description                                                                                    |
| -------------------- | ---------------- | -------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `urls`               | Array of strings | No       | Cisco Systems review page | CareerBliss company or review page URLs.                                                       |
| `results_wanted`     | Integer          | No       | `20`                      | Maximum number of reviews to save across the whole run.                                        |
| `max_pages`          | Integer          | No       | `20`                      | Maximum number of review pages to scan for each URL.                                           |
| `proxyConfiguration` | Object           | No       | Apify Proxy enabled       | Proxy settings. Apify Proxy is on by default because CareerBliss blocks direct cloud requests. |

Company URL forms you can submit:

| Input URL                                                                 | What the Actor does               |
| ------------------------------------------------------------------------- | --------------------------------- |
| `https://www.careerbliss.com/cisco-systems/`                              | Opens the company review listing. |
| `https://www.careerbliss.com/cisco-systems/reviews/`                      | Uses the listing as given.        |
| `https://www.careerbliss.com/cisco-systems/reviews/duty-manager/`         | Scans only that job title.        |
| `https://www.careerbliss.com/cisco-systems/reviews/?l=San%20Jose%2C%20CA` | Scans only that location.         |

## Usage Examples

### Collect reviews from one company

Save up to 50 Cisco Systems reviews from the first ten listing pages:

```json
{
    "urls": ["https://www.careerbliss.com/cisco-systems/reviews/"],
    "results_wanted": 50,
    "max_pages": 10
}
```

### Collect reviews from several companies

The `results_wanted` limit applies to the combined run. The URL order sets the processing order:

```json
{
    "urls": ["https://www.careerbliss.com/cisco-systems/reviews/", "https://www.careerbliss.com/intel/reviews/"],
    "results_wanted": 100,
    "max_pages": 10
}
```

### Collect one job title or one location

Paste the filtered review URL from CareerBliss. The Actor keeps the filter while it follows the pages:

```json
{
    "urls": [
        "https://www.careerbliss.com/cisco-systems/reviews/duty-manager/",
        "https://www.careerbliss.com/cisco-systems/reviews/?l=San%20Jose%2C%20CA"
    ],
    "results_wanted": 40,
    "max_pages": 5
}
```

### Use Apify Proxy with residential IPs

Apify Proxy is already on by default. Switch the group to residential when a long run needs a different pool of addresses:

```json
{
    "urls": ["https://www.careerbliss.com/cisco-systems/reviews/"],
    "results_wanted": 150,
    "max_pages": 20,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

## Sample Output

One dataset item from a live Cisco Systems run:

```json
{
    "review_id": "2084793",
    "company_name": "Cisco Systems",
    "job_title": "Duty Manager",
    "rating": 4.6,
    "review_text": "Cisco is a great place to work and offers many perks! I also found that its got excellent blend of people and cultures which i enjoyed being part of that inclusive environment!",
    "location": "Morrisville, NC",
    "review_url": "https://www.careerbliss.com/cisco-systems/reviews/duty-manager/#2084793",
    "source_url": "https://www.careerbliss.com/cisco-systems/reviews/",
    "person_you_work_for": 4,
    "people_you_work_with": 5,
    "work_setting": 5,
    "support_you_get": 5,
    "rewards_you_receive": 4,
    "growth_opportunities": 5,
    "company_culture": 4,
    "way_you_work": 5,
    "aggregate_rating": 4.1,
    "aggregate_review_count": 996
}
```

## Tips for Best Results

- **Use a review URL when you want a specific slice.** Job-title and location filters are part of the URL, so the Actor keeps them for every page.
- **Leave the proxy on for cloud runs.** CareerBliss rejects direct requests from data centers. The default Apify Proxy setting is what makes a Console or scheduled run return data.
- **Set both limits on purpose.** `results_wanted` caps the dataset for the whole run. `max_pages` caps the pages scanned for each URL, so a large result limit with a small page limit returns less than you asked for.
- **Start small.** A 20-review run finishes quickly and shows you the field coverage for your target company before you schedule a larger job.
- **Expect fewer sub-ratings on featured reviews.** CareerBliss promotes one review at the top of a listing without the workplace score block. Those items still include the review text, rating, location, and review link.
- **Compare like with like.** Reuse the same URL list and limits when you want to compare two runs over time.

## Integrations and Export Formats

Datasets can be downloaded as JSON, CSV, Excel, XML, or HTML. Common ways to use the output:

- **Google Sheets** - Open the dataset in a spreadsheet for review scoring and charts.
- **Airtable** - Keep a searchable employer review base with direct review links.
- **Webhooks** - Send finished runs to your own service or data warehouse.
- **Make or Zapier** - Start follow-up reporting or alerting without code.
- **Apify API** - Start runs and read dataset items from another application.

## Frequently Asked Questions

### Can I scrape more than one company in one run?

Yes. Add each company URL to `urls`. The Actor processes the list in order and stops when `results_wanted` is reached.

### Why are the review counts different from the number on the company page?

CareerBliss publishes a rating count in the page summary, and the listing can contain a different number of entries. The Actor saves the reviews it can reach within `max_pages` and reports the page's own count in `aggregate_review_count`. The two numbers can differ.

### Why do some reviews have no workplace scores?

CareerBliss promotes one review at the top of a listing and renders it without the score block. The Actor still saves that review with the text, rating, location, and review link.

### Can I collect reviews for one job title only?

Yes. Open the job title page on CareerBliss and paste that URL. The Actor keeps the job title scope while it follows the pages.

### Can I filter reviews by location?

Yes. Use the location filter URL from CareerBliss, or add `?l=` with the location name to a review URL. The filter stays in place for every page.

### Can I schedule recurring runs?

Yes. Create a schedule in Apify Console and reuse the same input. Comparing two datasets is the simplest way to spot new reviews.

### Can I export the dataset to CSV or Excel?

Yes. Apify datasets support CSV, Excel, JSON, XML, and HTML downloads. Use the Export button in the dataset view or the API.

### Why did a run save fewer reviews than requested?

The company may have fewer reviews than the limit, the page limit may have been reached, or the listing may have no more new entries. Check the run log for the stop reason.

### Why is Apify Proxy enabled by default?

CareerBliss rejects direct requests from cloud data centers. Apify Proxy gives the run a different address, so Console and scheduled runs can load the review pages. Turn it off only if you run the Actor from a residential connection.

### Is it permitted to collect CareerBliss content with this Actor?

CareerBliss's [Terms of Use](https://www.careerbliss.com/terms-of-use/) restrict automated navigation and copying site content without written consent. Get permission and review the current terms and applicable laws before running the Actor or using its results.

## Related Actors

- [Repvue.com Reviews Scraper](https://apify.com/shahidirfan/repvue-com-reviews-scraper) - Collect employer reviews and ratings from RepVue for another view of company sentiment.
- [Naukri Jobs Scraper](https://apify.com/shahidirfan/naukri-jobs-scraper) - Add current job listings and AmbitionBox company rating context when you need hiring data next to review data.

## Support

For issues or feature requests, use the Issues tab on this Actor's Apify Store page. Include the input URL, the run time, and the affected field so the problem can be reproduced.

## Legal Notice

CareerBliss's [Terms of Use](https://www.careerbliss.com/terms-of-use/) restrict automated navigation and searching, and they restrict aggregating or copying site content without written consent. Obtain the required permission before using this Actor. You are responsible for complying with the current terms, applicable laws, and privacy rules when you collect, store, or share the results.
