import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    loadDualOracle300Progress,
    parseUrlsFile,
    parseUrlsFileArg,
    recordDualOracle300Result,
} from './lib/dual-oracle-300-progress.mjs';

test('parseUrlsFile accepts string array and url objects', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-urls-'));
    const path = join(dir, 'urls.json');
    writeFileSync(
        path,
        JSON.stringify({
            urls: [
                'https://jobs.lever.co/a/apply',
                { url: 'https://jobs.ashbyhq.com/x/y/application' },
                { title: 'skip me' },
            ],
        }),
    );

    assert.deepEqual(parseUrlsFile(path), [
        'https://jobs.lever.co/a/apply',
        'https://jobs.ashbyhq.com/x/y/application',
    ]);
});

test('parseUrlsFileArg reads --urls-file', () => {
    assert.equal(
        parseUrlsFileArg(['--limit=5', '--urls-file=/tmp/q.json']),
        '/tmp/q.json',
    );
    assert.equal(parseUrlsFileArg(['--limit=5']), null);
});

test('recordDualOracle300Result tracks agrees and skips', () => {
    const progress = loadDualOracle300Progress();
    progress.agree_ids = [];
    progress.disagree_triage = [];
    progress.skipped = [];

    recordDualOracle300Result(progress, {
        status: 'agree',
        fixtureId: 'fix-a',
    });
    recordDualOracle300Result(progress, {
        status: 'error',
        pageUrl: 'https://example.test/apply',
        error: '404',
    }, { batch_id: 'batch-01' });

    assert.deepEqual(progress.agree_ids, ['fix-a']);
    assert.equal(progress.skipped.length, 1);
    assert.equal(progress.skipped[0].reason, '404');
});
