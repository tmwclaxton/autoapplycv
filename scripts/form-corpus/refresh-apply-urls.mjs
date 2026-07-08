#!/usr/bin/env node
/**
 * Append fresh job apply-page URLs from Firecrawl search.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { searchWeb } from './lib/firecrawl-client.mjs';
import { DISCOVERED_URLS_PATH } from './lib/paths.mjs';

const QUERIES = [
    'site:jobs.ashbyhq.com application',
    'site:jobs.ashbyhq.com apply resume cover letter',
    'site:boards.greenhouse.io jobs apply software',
    'site:boards.greenhouse.io jobs apply engineer',
    'site:boards.eu.greenhouse.io apply',
    'site:jobs.lever.co apply engineer',
    'site:jobs.lever.co apply remote',
    'site:jobs.eu.lever.co apply',
    'site:apply.workable.com apply',
    'site:jobs.smartrecruiters.com apply developer',
    'site:jobs.smartrecruiters.com oneclick-ui',
    'site:recruitee.com apply form',
    'site:teamtailor.com applications/new',
    'site:breezy.hr/p apply',
    'site:myworkdayjobs.com apply useMyLastApplication',
    'site:jobs.nhs.uk apply vacancy',
    'site:civil-service-careers.gov.uk job apply',
    'site:framestore.recruitee.com apply',
    'site:apply.workable.com j apply',
    'site:job-boards.greenhouse.io apply',
];

const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 25);
const data = JSON.parse(readFileSync(DISCOVERED_URLS_PATH, 'utf8'));
const seen = new Set(data.urls.map((row) => row.url));
let added = 0;

for (const query of QUERIES) {
    console.log(`Searching: ${query}`);

    try {
        const rows = await searchWeb(query, limit);

        for (const row of rows) {
            const url = row.url || row.link;

            if (!url || seen.has(url)) {
                continue;
            }

            seen.add(url);
            data.urls.push({
                url,
                title: row.title || '',
                description: row.description || '',
                query: 'apply-refresh',
            });
            added += 1;
        }
    } catch (error) {
        console.warn(`  failed: ${error.message}`);
    }
}

data.discovered_at = new Date().toISOString();
writeFileSync(DISCOVERED_URLS_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Added ${added} apply URLs (${data.urls.length} total) → ${DISCOVERED_URLS_PATH}`);
