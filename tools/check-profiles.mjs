/**
 * Checks which Impit fingerprint profiles can load a CareerBliss review page.
 * Run this when the actor starts failing, then keep PROFILE_POOL in
 * src/careerbliss.js aligned with the profiles that pass.
 *
 * Usage: node tools/check-profiles.mjs [url]
 */
/* eslint-disable no-console */
import { Impit } from 'impit';

const TARGET = process.argv[2] || 'https://www.careerbliss.com/cisco-systems/reviews/';

const PROFILES = [
    'chrome',
    'chrome100',
    'chrome101',
    'chrome104',
    'chrome107',
    'chrome110',
    'chrome116',
    'chrome124',
    'chrome125',
    'chrome131',
    'chrome136',
    'chrome142',
    'chrome151',
    'firefox',
    'firefox128',
    'firefox133',
    'firefox135',
    'firefox144',
    'firefox158',
    'okhttp',
    'okhttp3',
    'okhttp4',
    'okhttp5',
    'ios18',
];

const passed = [];

for (const browser of PROFILES) {
    try {
        const client = new Impit({ browser });
        const response = await client.fetch(TARGET, { timeout: 30_000 });
        const body = await response.text();
        const row = {
            browser,
            status: response.status,
            reviews: (body.match(/data-reviewid="/g) || []).length,
            challenge: /just a moment|challenge-platform|cf-chl/i.test(body),
        };
        if (row.status === 200 && row.reviews > 0) passed.push(browser);
        console.log(JSON.stringify(row));
    } catch (error) {
        console.log(JSON.stringify({ browser, error: String(error?.message || error).slice(0, 140) }));
    }
}

console.log(`\nPassing profiles (${passed.length}/${PROFILES.length}): ${passed.join(', ') || 'none'}`);
process.exitCode = passed.length ? 0 : 1;
