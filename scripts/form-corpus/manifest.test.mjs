import assert from 'node:assert/strict';
import test from 'node:test';
import {
    preserveVettedScenarioStatus,
    upsertScenario,
} from './lib/manifest.mjs';

test('upsertScenario keeps vetted when bridge scrape passes pending', () => {
    const manifest = {
        version: 1,
        scenarios: [
            {
                id: 'web-jobs-ashbyhq-com-application-173',
                status: 'vetted',
                html_file: 'web-jobs-ashbyhq-com-application-173.html',
                vet_issues: [],
            },
        ],
    };

    upsertScenario(manifest, {
        id: 'web-jobs-ashbyhq-com-application-173',
        status: 'pending',
        source: 'bridge-scrape',
        html_file: 'web-jobs-ashbyhq-com-application-173.html',
        page_title: 'Updated title',
    });

    const row = manifest.scenarios[0];
    assert.equal(row.status, 'vetted');
    assert.equal(row.page_title, 'Updated title');
});

test('preserveVettedScenarioStatus merges disk vetted over stale pending', () => {
    const inMemory = {
        version: 1,
        scenarios: [
            {
                id: 'web-jobs-ashbyhq-com-application-174',
                status: 'pending',
                html_file: 'web-jobs-ashbyhq-com-application-174.html',
            },
        ],
    };
    const onDisk = {
        version: 1,
        scenarios: [
            {
                id: 'web-jobs-ashbyhq-com-application-174',
                status: 'vetted',
                html_file: 'web-jobs-ashbyhq-com-application-174.html',
                vet_issues: ['ok'],
                variety: { ats_style: 'ashby' },
            },
        ],
    };

    const merged = preserveVettedScenarioStatus(inMemory, onDisk);
    const row = merged.scenarios[0];

    assert.equal(row.status, 'vetted');
    assert.deepEqual(row.vet_issues, ['ok']);
    assert.equal(row.variety?.ats_style, 'ashby');
});
