import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORCHESTRATOR = join(
    ROOT,
    'extension/src/shared/auto-apply-orchestrator.js',
);

test('Glassdoor OPEN_APPLY treats Indeed SmartApply navigation as success', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');

    assert.match(source, /onSmartApply && type === 'GLASSDOOR_OPEN_APPLY'/);
    assert.match(source, /Tab message timed out after \\d\+ms/);
    assert.match(source, /glassdoor-smartapply-security/);
    assert.match(source, /just a moment\|attention required\|security check/i);
});
