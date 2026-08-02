import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');

test('open-time external discovery reuses pause-on-external gate', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.ok(source.includes('async function skipAfterDiscoveredExternalApply('));
    assert.ok(source.includes('totaljobsApply:'));
    assert.ok(source.includes('indeedApply:'));
    assert.ok(source.includes('skipAfterDiscoveredExternalApply('));
    assert.ok(
        source.includes(
            'platform === INDEED_PLATFORM_ID || platform === GLASSDOOR_PLATFORM_ID',
        ),
    );
    assert.ok(
        source.includes(
            "if (applyResponse?.totaljobsApply === false || !applyResponse?.success)",
        ),
    );
    assert.ok(
        source.includes(
            "if (applyResponse?.reedApply === false || !applyResponse?.success)",
        ),
    );
    assert.ok(
        source.includes(
            "if (applyResponse?.easyApply === false || !applyResponse?.success)",
        ),
    );

    const reedProcessStart = source.indexOf('async function processReedJob(');
    const reedOpenFailure = source.slice(
        reedProcessStart,
        source.indexOf('const fitSession', reedProcessStart),
    );

    assert.match(
        reedOpenFailure,
        /openResult\.skipReason === 'no_reed_apply'[\s\S]*?skipAfterDiscoveredExternalApply\([\s\S]*?'no_reed_apply'/,
    );

    const glassdoorAvailabilityStart = source.indexOf(
        'const applyAvailability = await sendGlassdoorMessage(',
    );
    const glassdoorAvailability = source.slice(
        glassdoorAvailabilityStart,
        source.indexOf('const fitSession', glassdoorAvailabilityStart),
    );

    assert.match(
        glassdoorAvailability,
        /applyAvailability\?\.easyApply === false[\s\S]*?skipAfterDiscoveredExternalApply\([\s\S]*?'no_glassdoor_apply'/,
    );
});
