import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('sendIndeedApplyFlowMessage uses 45s timeout for FILL_AND_ADVANCE', () => {
    const source = fs.readFileSync('extension/src/shared/form-frame-messaging.js', 'utf8');
    assert.match(source, /INDEED_FILL_AND_ADVANCE[\s\S]{0,120}45_000/);
});
