#!/usr/bin/env node
/**
 * Build dual-oracle URL queue (~450+) from discover results, Ashby posting API,
 * seeds, and adjacent multi-field form queries. Emits:
 *   oracle-url-queue.json
 *   oracle-url-queue-batch-01.json ... batch-06.json (50 each)
 *   oracle-url-queue-reserve.json
 *
 * Usage:
 *   node scripts/form-corpus/build-oracle-url-queue.mjs
 *   node scripts/form-corpus/build-oracle-url-queue.mjs --target=450 --batch-size=50
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ashbyApplicationUrl, parseAshbyUrl } from './lib/ashby-board.mjs';
import { FIXTURE_ROOT, DISCOVERED_URLS_PATH } from './lib/paths.mjs';
import {
    isLikelyApplyUrl,
    normalizeUrl,
    urlPriority,
} from './lib/scrape-url-queue.mjs';
import { SEED_URLS } from './lib/seed-urls.mjs';

const QUEUE_PATH = join(FIXTURE_ROOT, 'oracle-url-queue.json');
const ORACLE_SIDECAR_DIR = join(FIXTURE_ROOT, 'oracle-sidecars');
const BATCH_SIZE = 50;
const BATCH_COUNT = 6;

const ASHBY_BOARD_SLUGS = [
    'notion', 'directive', 'linear', 'ramp', 'openai', 'perplexity', 'synthesia',
    'stripe', 'figma', 'vercel', 'supabase', 'retool', 'mercury', 'brex',
    'scaleai', 'anthropic', 'cursor', 'databricks', 'snowflake', 'cloudflare',
    'hashicorp', 'gitlab', 'duolingo', 'robinhood', 'coinbase', 'kraken',
    'airtable', 'asana', 'canva', 'miro', 'loom', 'calendly', 'intercom',
    'hubspot', 'segment', 'amplitude', 'mixpanel', 'posthog', 'sentry',
    'launchdarkly', 'pagerduty', 'datadog', 'elastic', 'mongodb', 'neo4j',
    'planetscale', 'neon', 'railway', 'render', 'fly', 'digitalocean',
    'twilio', 'sendgrid', 'mailchimp', 'shopify', 'square', 'adyen',
    'klarna', 'nubank', 'revolut', 'monzo', 'starling', 'wise',
    'ironcladhq', 'base-power', 'formenergy', 'hinge-health', 'eliseai',
    'imprint', 'kindred', 'knock', 'litmus', 'mercor', 'mollie', 'monogram',
    'nerdwallet', 'jane', 'camunda', 'angi', 'aven', 'citizen', 'cube', 'dash0',
    'firecrawl', 'fyxer', 'capimoney',
];

const LEVER_COMPANY_SLUGS = [
    'netflix', 'spotify', 'canva', 'figma', 'notion', 'stripe', 'shopify',
    'twitch', 'palantir', 'eventbrite', 'box', 'dropbox', 'reddit', 'quora',
    'hively', 'promenade', 'instrumentl', 'happyco', 'brilliant', 'wealthsimple',
    'wealthfront', 'affirm', 'chime', 'plaid', 'brex', 'ramp', 'rippling',
    'gusto', 'lattice', 'cultureamp',
];

const GREENHOUSE_BOARD_TOKENS = [
    'stripe', 'airbnb', 'discord', 'datadog', 'shopify', 'anthropic', 'openai',
    'figma', 'notion', 'cloudflare', 'hashicorp', 'gitlab', 'reddit', 'pinterest',
    'lyft', 'uber', 'doordash', 'instacart', 'robinhood', 'coinbase',
    'square', 'twilio', 'sendgrid', 'databricks', 'snowflake', 'mongodb',
    'elastic', 'splunk', 'okta', 'crowdstrike', 'zscaler', 'formlabs',
];

/** Soft caps so Ashby cannot monopolize the primary 300. */
const FAMILY_PRIMARY_CAPS = {
    ashby: 90,
    lever: 70,
    greenhouse: 60,
    workable: 40,
    personio: 20,
    recruitee: 20,
    adjacent: 30,
    other: 50,
};

const ADJACENT_SEED_URLS = [
    { url: 'https://www.jotform.com/form-templates/grant-application-form', title: 'JotForm Grant Application', source: 'adjacent' },
    { url: 'https://www.jotform.com/form-templates/volunteer-application-form', title: 'JotForm Volunteer Application', source: 'adjacent' },
    { url: 'https://www.jotform.com/form-templates/scholarship-application-form', title: 'JotForm Scholarship Application', source: 'adjacent' },
    { url: 'https://tally.so/templates/grant-application-form', title: 'Tally Grant Application', source: 'adjacent' },
    { url: 'https://www.cognitoforms.com/templates/Nonprofit/GrantApplication', title: 'Cognito Grant Application', source: 'adjacent' },
    { url: 'https://www.123formbuilder.com/free-form-templates/Grant-Application-Form/', title: '123FormBuilder Grant', source: 'adjacent' },
    { url: 'https://formbold.com/templates/grant-application-form/', title: 'FormBold Grant', source: 'adjacent' },
    { url: 'https://www.wpforms.com/templates/grant-application-form-template/', title: 'WPForms Grant', source: 'adjacent' },
    { url: 'https://www.paperform.co/templates/grant-application/', title: 'Paperform Grant', source: 'adjacent' },
    { url: 'https://www.surveyjs.io/form-library/examples/survey-create-grant-application-form/reactjs', title: 'SurveyJS Grant', source: 'adjacent' },
    { url: 'https://mdn.github.io/learning-area/html/forms/your-first-HTML-form/first-form.html', title: 'MDN First Form', source: 'adjacent' },
    { url: 'https://mdn.github.io/learning-area/html/forms/html5-forms/example.html', title: 'MDN HTML5 Forms', source: 'adjacent' },
    { url: 'https://www.w3schools.com/howto/howto_css_contact_form.asp', title: 'W3Schools Contact', source: 'adjacent' },
    { url: 'https://www.w3schools.com/howto/howto_css_register_form.asp', title: 'W3Schools Register', source: 'adjacent' },
    { url: 'https://www.surveyjs.io/form-library/examples/hr/employee-information-form/reactjs', title: 'SurveyJS Employee Info', source: 'adjacent' },
    { url: 'https://www.surveyjs.io/form-library/examples/hr/employee-onboarding-form/reactjs', title: 'SurveyJS Onboarding', source: 'adjacent' },
    { url: 'https://www.jotform.com/form-templates/internship-application-form', title: 'JotForm Internship', source: 'adjacent' },
    { url: 'https://www.jotform.com/form-templates/employment-application-form', title: 'JotForm Employment', source: 'adjacent' },
    { url: 'https://formbold.com/templates/job-application-form/', title: 'FormBold Job Application', source: 'adjacent' },
    { url: 'https://www.123formbuilder.com/free-form-templates/Employment-Application-Form-224444/', title: '123FormBuilder Employment', source: 'adjacent' },
    { url: 'https://www.civil-service-careers.gov.uk/jobs/', title: 'Civil Service Careers', source: 'adjacent' },
    { url: 'https://www.nhsjobs.com/', title: 'NHS Jobs', source: 'adjacent' },
    { url: 'https://apply.workable.com/hospitable/j/2C9EFD455D/apply/', title: 'Hospitable Workable', source: 'workable-seed' },
    { url: 'https://apply.workable.com/dispel/j/0EB183AFEE/apply/', title: 'Dispel Workable', source: 'workable-seed' },
    { url: 'https://apply.workable.com/seeq/j/A966C8897D/apply/', title: 'Seeq Workable', source: 'workable-seed' },
    { url: 'https://apply.workable.com/rokt/j/2DA80430C8/apply/', title: 'Rokt Workable', source: 'workable-seed' },
    { url: 'https://apply.workable.com/openmined/j/0C52D130E3/apply/', title: 'OpenMined Workable', source: 'workable-seed' },
];

/**
 * @param {string} url
 * @param {string} [source]
 * @returns {string}
 */
function atsFamily(url, source = '') {
    if (source === 'adjacent') {
        return 'adjacent';
    }

    if (source === 'workable-seed' || source === 'workable-api') {
        return 'workable';
    }

    try {
        const host = new URL(url).hostname.toLowerCase();

        if (host.includes('ashbyhq.com')) {
            return 'ashby';
        }

        // Use lever.co host match only - hostname.includes('lever') false-positives on "clever".
        if (/(^|\.)lever\.co$/.test(host)) {
            return 'lever';
        }

        if (host.includes('greenhouse.io') || host.includes('greenhouse.com')) {
            return 'greenhouse';
        }

        if (host.includes('workable.com')) {
            return 'workable';
        }

        if (host.includes('personio.')) {
            return 'personio';
        }

        if (host.includes('recruitee.com')) {
            return 'recruitee';
        }

        if (host.includes('teamtailor.com')) {
            return 'teamtailor';
        }

        if (host.includes('smartrecruiters.com')) {
            return 'smartrecruiters';
        }

        if (host.includes('breezy.hr')) {
            return 'breezy';
        }

        if (host.includes('bamboohr.com')) {
            return 'bamboohr';
        }

        if (host.includes('icims.com')) {
            return 'icims';
        }

        if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
            return 'workday';
        }

        if (host.includes('onlyfy.jobs') || host.includes('softgarden.')) {
            return 'onlyfy';
        }

        if (host.includes('jobvite.com')) {
            return 'jobvite';
        }

        if (host.includes('taleo.')) {
            return 'taleo';
        }
    } catch {
        // fall through
    }

    return 'other';
}

function parseArg(name, fallback) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

/**
 * @returns {Set<string>}
 */
function loadCapturedUrlKeys() {
    const keys = new Set();

    if (!existsSync(ORACLE_SIDECAR_DIR)) {
        return keys;
    }

    for (const name of readdirSync(ORACLE_SIDECAR_DIR)) {
        if (!name.endsWith('.json')) {
            continue;
        }

        try {
            const sidecar = JSON.parse(
                readFileSync(join(ORACLE_SIDECAR_DIR, name), 'utf8'),
            );
            const pageUrl = sidecar.page_url || sidecar.pageUrl;

            if (typeof pageUrl === 'string' && pageUrl) {
                keys.add(normalizeUrl(pageUrl));
            }
        } catch {
            // ignore corrupt sidecars
        }
    }

    return keys;
}

/**
 * @param {string} companySlug
 * @param {number} maxJobs
 * @returns {Promise<object[]>}
 */
async function fetchAshbyBoardJobs(companySlug, maxJobs) {
    const endpoint = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`;

    try {
        const response = await fetch(endpoint, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

        return jobs.slice(0, maxJobs).map((job) => ({
            url: ashbyApplicationUrl(companySlug, job.id),
            title: `${job.title || 'Role'} @ ${companySlug}`,
            source: 'ashby-api',
            company: companySlug,
            family: 'ashby',
        }));
    } catch {
        return [];
    }
}

/**
 * @param {string} companySlug
 * @param {number} maxJobs
 * @returns {Promise<object[]>}
 */
async function fetchLeverPostings(companySlug, maxJobs) {
    const endpoint = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;

    try {
        const response = await fetch(endpoint, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            return [];
        }

        const jobs = await response.json();

        if (!Array.isArray(jobs)) {
            return [];
        }

        return jobs.slice(0, maxJobs).map((job) => {
            const id = job.id || job.shortcode;
            const applyUrl = typeof job.applyUrl === 'string' && job.applyUrl
                ? job.applyUrl
                : `https://jobs.lever.co/${companySlug}/${id}/apply`;

            return {
                url: applyUrl,
                title: `${job.text || job.title || 'Role'} @ ${companySlug}`,
                source: 'lever-api',
                company: companySlug,
                family: 'lever',
            };
        });
    } catch {
        return [];
    }
}

/**
 * @param {string} boardToken
 * @param {number} maxJobs
 * @returns {Promise<object[]>}
 */
async function fetchGreenhouseJobs(boardToken, maxJobs) {
    const endpoint = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`;

    try {
        const response = await fetch(endpoint, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

        return jobs.slice(0, maxJobs).map((job) => ({
            url: job.absolute_url
                ? String(job.absolute_url).replace(/\/?$/, '')
                : `https://boards.greenhouse.io/${boardToken}/jobs/${job.id}`,
            title: `${job.title || 'Role'} @ ${boardToken}`,
            source: 'greenhouse-api',
            company: boardToken,
            family: 'greenhouse',
        }));
    } catch {
        return [];
    }
}

/**
 * @param {object[]} ranked
 * @param {number} primaryCount
 * @returns {object[]}
 */
function selectDiversePrimary(ranked, primaryCount) {
    /** @type {Record<string, object[]>} */
    const buckets = {};

    for (const row of ranked) {
        const family = row.family || atsFamily(row.url, row.source);
        row.family = family;

        if (!buckets[family]) {
            buckets[family] = [];
        }

        buckets[family].push(row);
    }

    for (const family of Object.keys(buckets)) {
        buckets[family].sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url));
    }

    const selected = [];
    const used = new Set();
    const counts = Object.fromEntries(Object.keys(FAMILY_PRIMARY_CAPS).map((key) => [key, 0]));
    const familyOrder = Object.keys(FAMILY_PRIMARY_CAPS);

    while (selected.length < primaryCount) {
        let added = false;

        for (const family of familyOrder) {
            if (selected.length >= primaryCount) {
                break;
            }

            const cap = FAMILY_PRIMARY_CAPS[family] ?? 40;

            if ((counts[family] || 0) >= cap) {
                continue;
            }

            const bucket = buckets[family] || [];

            while (bucket.length > 0) {
                const next = bucket.shift();

                if (!next || used.has(next.url)) {
                    continue;
                }

                used.add(next.url);
                selected.push(next);
                counts[family] = (counts[family] || 0) + 1;
                added = true;
                break;
            }
        }

        if (!added) {
            break;
        }
    }

    if (selected.length < primaryCount) {
        const leftovers = ranked
            .filter((row) => !used.has(row.url))
            .sort((a, b) => {
                const aAshby = (a.family || '') === 'ashby' ? 1 : 0;
                const bAshby = (b.family || '') === 'ashby' ? 1 : 0;

                return aAshby - bAshby || b.priority - a.priority;
            });

        for (const row of leftovers) {
            if (selected.length >= primaryCount) {
                break;
            }

            selected.push(row);
            used.add(row.url);
        }
    }

    return selected;
}

/**
 * @param {object[]} discovered
 * @returns {object[]}
 */
function fromDiscovered(discovered) {
    return discovered.map((row) => ({
        url: row.url,
        title: row.title || '',
        source: row.source || 'discover',
        query: row.query || null,
    }));
}

/**
 * Promote Ashby job detail URLs to /application.
 *
 * @param {string} url
 * @returns {string}
 */
function preferAshbyApplication(url) {
    const parsed = parseAshbyUrl(url);

    if (!parsed?.jobPostingId || parsed.isApplication) {
        return url;
    }

    return ashbyApplicationUrl(parsed.companySlug, parsed.jobPostingId);
}

async function main() {
    const target = Number(parseArg('target', '450'));
    const batchSize = Number(parseArg('batch-size', String(BATCH_SIZE)));
    const perBoard = Number(parseArg('per-board', '8'));
    const captured = loadCapturedUrlKeys();

    /** @type {object[]} */
    let candidates = [];

    if (existsSync(DISCOVERED_URLS_PATH)) {
        const discovered = JSON.parse(readFileSync(DISCOVERED_URLS_PATH, 'utf8'));
        const rows = Array.isArray(discovered?.urls) ? discovered.urls : [];
        candidates.push(...fromDiscovered(rows));
    }

    candidates.push(
        ...SEED_URLS.map((row) => ({
            url: row.url,
            title: row.title || '',
            source: 'seed',
        })),
    );
    candidates.push(...ADJACENT_SEED_URLS);

    console.log(`Fetching Ashby boards (${ASHBY_BOARD_SLUGS.length} slugs, max ${perBoard}/board)...`);

    for (const slug of ASHBY_BOARD_SLUGS) {
        const jobs = await fetchAshbyBoardJobs(slug, Math.min(perBoard, 4));
        candidates.push(...jobs);
        process.stdout.write('.');
    }

    process.stdout.write('\n');
    console.log(`Fetching Lever postings (${LEVER_COMPANY_SLUGS.length} companies)...`);

    for (const slug of LEVER_COMPANY_SLUGS) {
        const jobs = await fetchLeverPostings(slug, perBoard);
        candidates.push(...jobs);
        process.stdout.write('.');
    }

    process.stdout.write('\n');
    console.log(`Fetching Greenhouse boards (${GREENHOUSE_BOARD_TOKENS.length} tokens)...`);

    for (const token of GREENHOUSE_BOARD_TOKENS) {
        const jobs = await fetchGreenhouseJobs(token, perBoard);
        candidates.push(...jobs);
        process.stdout.write('.');
    }

    process.stdout.write('\n');

    const seen = new Set();
    const ranked = [];

    for (const row of candidates) {
        if (!row?.url || typeof row.url !== 'string') {
            continue;
        }

        let url = preferAshbyApplication(row.url.trim());

        try {
            url = normalizeUrl(url);
        } catch {
            continue;
        }

        if (seen.has(url) || captured.has(url)) {
            continue;
        }

        const family = row.family || atsFamily(url, row.source);
        const forceKeep = family !== 'other'
            || row.source === 'adjacent'
            || row.source === 'ashby-api'
            || row.source === 'lever-api'
            || row.source === 'greenhouse-api'
            || row.source === 'workable-seed';

        if (!forceKeep && !isLikelyApplyUrl(url)) {
            continue;
        }

        seen.add(url);
        ranked.push({
            url,
            title: row.title || '',
            source: row.source || 'unknown',
            family,
            priority: urlPriority(url)
                + (family === 'ashby' ? 0 : 8)
                + (row.source === 'adjacent' ? 5 : 0),
        });
    }

    ranked.sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url));

    const primaryCount = batchSize * BATCH_COUNT;
    const primary = selectDiversePrimary(ranked, primaryCount);
    const primaryUrls = new Set(primary.map((row) => row.url));
    const reserve = ranked.filter((row) => !primaryUrls.has(row.url)).slice(0, Math.max(100, target - primaryCount));
    const selected = [...primary, ...reserve];

    mkdirSync(FIXTURE_ROOT, { recursive: true });

    const queueDoc = {
        version: 1,
        built_at: new Date().toISOString(),
        target,
        total: selected.length,
        primary: primary.length,
        reserve: reserve.length,
        urls: selected,
    };
    writeFileSync(QUEUE_PATH, `${JSON.stringify(queueDoc, null, 2)}\n`);

    for (let i = 0; i < BATCH_COUNT; i += 1) {
        const slice = primary.slice(i * batchSize, (i + 1) * batchSize);
        const batchPath = join(
            FIXTURE_ROOT,
            `oracle-url-queue-batch-${String(i + 1).padStart(2, '0')}.json`,
        );
        writeFileSync(
            batchPath,
            `${JSON.stringify({
                version: 1,
                batch_id: `oracle-url-queue-batch-${String(i + 1).padStart(2, '0')}`,
                built_at: queueDoc.built_at,
                urls: slice,
            }, null, 2)}\n`,
        );
    }

    writeFileSync(
        join(FIXTURE_ROOT, 'oracle-url-queue-reserve.json'),
        `${JSON.stringify({
            version: 1,
            built_at: queueDoc.built_at,
            urls: reserve,
        }, null, 2)}\n`,
    );

    const bySource = {};
    const byFamily = {};
    const primaryByFamily = {};

    for (const row of selected) {
        bySource[row.source] = (bySource[row.source] || 0) + 1;
        byFamily[row.family || 'other'] = (byFamily[row.family || 'other'] || 0) + 1;
    }

    for (const row of primary) {
        primaryByFamily[row.family || 'other'] = (primaryByFamily[row.family || 'other'] || 0) + 1;
    }

    console.log(JSON.stringify({
        queue: QUEUE_PATH,
        total: selected.length,
        primary: primary.length,
        reserve: reserve.length,
        by_source: bySource,
        by_family: byFamily,
        primary_by_family: primaryByFamily,
        family_caps: FAMILY_PRIMARY_CAPS,
        batches: BATCH_COUNT,
        batch_size: batchSize,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
