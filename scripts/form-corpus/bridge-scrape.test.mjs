import assert from 'node:assert/strict';
import test from 'node:test';
import { findAshbyApplyButton } from './lib/ashby-board-crawl.mjs';
import {
    ashbyApplicationUrl,
    ashbyBoardUrl,
    ashbyJobDetailUrl,
    collapseAshbyQueueToBoards,
    extractAshbyApplyUrlsFromHtml,
    extractAshbyJobDetailUrlsFromHtml,
    groupAshbyUrlsByCompany,
    parseAshbyUrl,
} from './lib/ashby-board.mjs';
import {
    evaluateBridgeAcceptGate,
    isMeaningfulField,
    normalizeBridgeInventory,
} from './lib/bridge-field-gate.mjs';
import {
    applyUrlVariants,
    buildScrapeQueue,
    isJsHeavyHost,
    isLikelyApplyUrl,
    isSkippedUrl,
    normalizeUrl,
    urlPriority,
} from './lib/scrape-url-queue.mjs';
import { shouldMinifyHtmlFixture } from './lib/write-html-fixture.mjs';

test('parseAshbyUrl groups company slug and application paths', () => {
    assert.deepEqual(
        parseAshbyUrl(
            'https://jobs.ashbyhq.com/directive/f5c0ef20-3e76-40e0-9e24-e99109403486/application',
        ),
        {
            companySlug: 'directive',
            jobPostingId: 'f5c0ef20-3e76-40e0-9e24-e99109403486',
            isApplication: true,
            isBoard: false,
        },
    );
    assert.deepEqual(parseAshbyUrl('https://jobs.ashbyhq.com/directive'), {
        companySlug: 'directive',
        jobPostingId: null,
        isApplication: false,
        isBoard: true,
    });
});

test('groupAshbyUrlsByCompany collapses stale job URLs under one board', () => {
    const groups = groupAshbyUrlsByCompany([
        {
            url: 'https://jobs.ashbyhq.com/directive/f5c0ef20-3e76-40e0-9e24-e99109403486/application',
        },
        {
            url: 'https://jobs.ashbyhq.com/directive/31e63cb3-1204-491e-837e-0e55ec670f08/application',
        },
        { url: 'https://jobs.lever.co/acme/111/apply' },
    ]);

    assert.equal(groups.size, 1);
    assert.equal(groups.get('directive')?.boardUrl, ashbyBoardUrl('directive'));
    assert.equal(groups.get('directive')?.sourceUrls.length, 2);
});

test('extractAshbyJobDetailUrlsFromHtml returns job pages without /application', () => {
    const boardUrl = ashbyBoardUrl('notion');
    const html = `<!DOCTYPE html><html><body><script>window.__appData = ${JSON.stringify(
        {
            organization: { hostedJobsPageSlug: 'notion' },
            jobBoard: {
                jobPostings: [
                    {
                        id: 'f603aedb-1454-4a75-b2f0-a3afb2a8f973',
                        isListed: true,
                    },
                ],
            },
        },
    )};</script><a href="/notion/f603aedb-1454-4a75-b2f0-a3afb2a8f973">View job</a></body></html>`;

    const urls = extractAshbyJobDetailUrlsFromHtml(html, boardUrl);

    assert.ok(
        urls.includes(
            ashbyJobDetailUrl(
                'notion',
                'f603aedb-1454-4a75-b2f0-a3afb2a8f973',
            ),
        ),
    );
    assert.equal(
        urls.some((url) => url.endsWith('/application')),
        false,
    );
});

test('findAshbyApplyButton matches Ashby job detail Apply labels', () => {
    const buttons = [
        { text: 'Share', disabled: false },
        { text: 'Apply for this job', disabled: false },
    ];

    assert.equal(findAshbyApplyButton(buttons)?.text, 'Apply for this job');
    assert.equal(findAshbyApplyButton([{ text: 'Applied', disabled: false }]), null);
});

test('findAshbyApplyButton matches Ashby Application tab links', () => {
    const buttons = [
        { text: 'Overview', disabled: false, href: '/notion/uuid' },
        {
            text: 'Application',
            disabled: false,
            href: '/notion/uuid/application',
            id: 'job-application-form',
        },
    ];

    assert.equal(findAshbyApplyButton(buttons)?.text, 'Application');
});

test('extractAshbyApplyUrlsFromHtml reads __appData and href fallbacks', () => {
    const boardUrl = ashbyBoardUrl('directive');
    const html = `<!DOCTYPE html><html><body><script>window.__appData = ${JSON.stringify(
        {
            organization: { hostedJobsPageSlug: 'directive' },
            jobBoard: {
                jobPostings: [
                    {
                        id: 'd8f6625a-4003-429c-9522-04c5eaed8dbf',
                        isListed: true,
                    },
                    {
                        id: 'deadbeef-dead-beef-dead-beefdeadbeef',
                        isListed: false,
                    },
                ],
            },
        },
    )};</script><a href="/directive/ae2fd9c6-0161-42a0-b249-ff046a00c8f1/application">Apply</a></body></html>`;

    const urls = extractAshbyApplyUrlsFromHtml(html, boardUrl);

    assert.ok(
        urls.includes(
            ashbyApplicationUrl(
                'directive',
                'd8f6625a-4003-429c-9522-04c5eaed8dbf',
            ),
        ),
    );
    assert.ok(
        urls.includes(
            ashbyApplicationUrl(
                'directive',
                'ae2fd9c6-0161-42a0-b249-ff046a00c8f1',
            ),
        ),
    );
    assert.equal(
        urls.some((url) => url.includes('deadbeef-dead-beef-dead-beefdeadbeef')),
        false,
    );
});

test('collapseAshbyQueueToBoards prefers board hubs over job URLs', () => {
    const existingUrls = new Set();
    const queue = collapseAshbyQueueToBoards(
        [
            {
                url: 'https://jobs.ashbyhq.com/directive/f5c0ef20-3e76-40e0-9e24-e99109403486/application',
            },
            { url: 'https://jobs.lever.co/acme/222/apply' },
        ],
        existingUrls,
    );

    assert.equal(queue.length, 2);
    assert.equal(queue[0].ashbyBoard, true);
    assert.equal(queue[0].url, ashbyBoardUrl('directive'));
    assert.equal(queue[1].url, 'https://jobs.lever.co/acme/222/apply');
});

test('isSkippedUrl rejects blogs and template pages', () => {
    assert.equal(
        isSkippedUrl('https://www.jotform.com/blog/job-application-form'),
        true,
    );
    assert.equal(
        isSkippedUrl('https://boards.greenhouse.io/acme/jobs/123/apply'),
        false,
    );
});

test('isLikelyApplyUrl prefers ATS hosts and apply paths', () => {
    assert.equal(
        isLikelyApplyUrl('https://jobs.lever.co/acme/abc-123/apply'),
        true,
    );
    assert.equal(isLikelyApplyUrl('https://example.com/about'), false);
    assert.equal(
        isLikelyApplyUrl('https://www.jotform.com/form/123/application-form'),
        true,
    );
});

test('urlPriority ranks ATS apply URLs above generic pages', () => {
    const ats = urlPriority('https://jobs.ashbyhq.com/acme/application');
    const generic = urlPriority('https://example.com/careers');

    assert.ok(ats > generic);
});

test('buildScrapeQueue skips existing manifest URLs and sorts by priority', () => {
    const manifest = {
        scenarios: [
            {
                id: 'web-existing',
                source_url: 'https://jobs.lever.co/acme/111/apply',
            },
        ],
    };
    const discovered = [
        { url: 'https://example.com/careers', title: 'Careers' },
        { url: 'https://jobs.lever.co/acme/222/apply', title: 'Apply' },
        { url: 'https://jobs.lever.co/acme/111/apply', title: 'Duplicate' },
    ];

    const queue = buildScrapeQueue(discovered, manifest, { applyOnly: true });

    assert.equal(queue.length, 1);
    assert.equal(queue[0].url, 'https://jobs.lever.co/acme/222/apply');
});

test('applyUrlVariants adds lever /apply suffix', () => {
    const variants = applyUrlVariants(
        'https://jobs.lever.co/acme/550e8400-e29b-41d4-a716-446655440000',
    );

    assert.ok(variants.some((url) => url.endsWith('/apply')));
});

test('normalizeUrl strips hash and trailing slash', () => {
    assert.equal(
        normalizeUrl('https://example.com/apply/#step'),
        'https://example.com/apply',
    );
});

test('isMeaningfulField requires ref and non-generic label', () => {
    assert.equal(
        isMeaningfulField({ ref: 'f0', question: 'Email address' }),
        true,
    );
    assert.equal(isMeaningfulField({ ref: 'f0', question: 'input' }), false);
    assert.equal(isMeaningfulField({ question: 'Email address' }), false);
});

test('evaluateBridgeAcceptGate requires meaningful inventory fields', () => {
    const pass = evaluateBridgeAcceptGate({
        elements: [
            { ref: 'f0', question: 'Full name' },
            { ref: 'f1', question: 'Email address' },
        ],
    });
    const fail = evaluateBridgeAcceptGate({
        elements: [
            { ref: 'f0', question: 'input' },
            { ref: 'f1', question: 'Go' },
        ],
    });

    assert.equal(pass.accepted, true);
    assert.equal(fail.accepted, false);
    assert.match(fail.reason, /meaningful fields/);
});

test('normalizeBridgeInventory reads snapshot.elements and fields', () => {
    const snapshotInventory = {
        snapshot: {
            elements: [
                { ref: 'f0', question: 'Full name' },
                { ref: 'f1', question: 'Email address' },
            ],
        },
    };
    const fieldsInventory = {
        fields: [
            { ref: 'f0', label: 'Full name' },
            { ref: 'f1', label: 'Email address' },
        ],
    };

    assert.equal(normalizeBridgeInventory(snapshotInventory).elements.length, 2);
    assert.equal(
        evaluateBridgeAcceptGate(snapshotInventory).accepted,
        true,
    );
    assert.equal(
        evaluateBridgeAcceptGate(fieldsInventory).accepted,
        true,
    );
});

test('bridge scrape progress checkpoint shape', () => {
    const progress = {
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attempted_urls: [],
        accepted_ids: [],
        skipped: [],
        scraped: 0,
        accepted: 0,
        last_url: null,
    };

    assert.ok(Array.isArray(progress.attempted_urls));
    assert.ok(Array.isArray(progress.accepted_ids));
    assert.ok(Array.isArray(progress.skipped));
    assert.equal(typeof progress.scraped, 'number');
    assert.equal(typeof progress.accepted, 'number');
});

test('isJsHeavyHost matches JS-rendered ATS apply hosts', () => {
    assert.equal(isJsHeavyHost('https://jobs.lever.co/acme/abc/apply'), true);
    assert.equal(isJsHeavyHost('https://jobs.ashbyhq.com/acme/application'), true);
    assert.equal(isJsHeavyHost('https://boards.greenhouse.io/acme/jobs/123'), true);
    assert.equal(isJsHeavyHost('https://acme.myworkdayjobs.com/en-US/careers/apply'), true);
    assert.equal(isJsHeavyHost('https://apply.workable.com/acme/j/123'), true);
    assert.equal(
        isJsHeavyHost('https://jobs.smartrecruiters.com/Acme/1234567890'),
        true,
    );
    assert.equal(isJsHeavyHost('https://www.jotform.com/form/123'), false);
});

test('shouldMinifyHtmlFixture skips minify for JS-heavy bridge captures', () => {
    assert.equal(
        shouldMinifyHtmlFixture('https://jobs.lever.co/acme/abc/apply', undefined),
        false,
    );
    assert.equal(
        shouldMinifyHtmlFixture('https://example.com/apply', undefined),
        true,
    );
    assert.equal(
        shouldMinifyHtmlFixture('https://jobs.lever.co/acme/abc/apply', true),
        true,
    );
});
