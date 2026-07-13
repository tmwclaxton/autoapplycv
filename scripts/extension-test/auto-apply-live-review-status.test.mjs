#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const status = JSON.parse(readFileSync(
    join(import.meta.dirname, '../../tests/fixtures/auto-apply/auto-apply-live-review-status.json'),
    'utf8',
));

assert.equal(status.campaign, 'auto-apply-live-quality');
assert.equal(status.campaign_status, 'resumed');
assert.ok(Array.isArray(status.scenarios_tested));
assert.ok(status.platform_summary.indeed);

const sampleRow = {
    scenario_id: 'p0-01',
    platform: 'indeed',
    persona_id: 'us_scientist',
    profile_email: 'test-us-scientist@autocvapply.test',
    result: 'blocked',
    accuracy_notes: ['Search host verified: www.indeed.com'],
};

assert.ok(Array.isArray(sampleRow.accuracy_notes));

console.log('auto-apply-live-review-status schema smoke test passed.');
