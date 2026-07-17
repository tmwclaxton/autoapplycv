#!/usr/bin/env node
/**
 * Auto Apply reliability gate tracker for all claimed platforms.
 *
 * Offline structural checks (default):
 *   node scripts/extension-test/auto-apply-reliability-gate.mjs
 *
 * Record a live scenario result after MCP HTML verification:
 *   node scripts/extension-test/auto-apply-reliability-gate.mjs --record=totaljobs --result=pass --job="Title @ Co"
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE_PATH = join(ROOT, 'tests/fixtures/auto-apply/auto-apply-reliability-gate.json');
const ORCHESTRATOR = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');
const CONTENT = join(ROOT, 'extension/src/content/index.js');
const PLATFORMS = join(ROOT, 'extension/src/shared/auto-apply-platforms.js');
const TOTALJOBS = join(ROOT, 'extension/src/content/totaljobs-auto-apply.js');

const GATE_PLATFORM_IDS = [
    'linkedin',
    'indeed',
    'totaljobs',
    'glassdoor',
    'reed',
    'simplyhired',
    'cvlibrary',
];

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');

        return [key, value ?? 'true'];
    }),
);

function loadGate() {
    return JSON.parse(readFileSync(GATE_PATH, 'utf8'));
}

function saveGate(data) {
    writeFileSync(GATE_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function ensurePlatformBuckets(gate) {
    if (!gate.platforms || typeof gate.platforms !== 'object') {
        gate.platforms = {};
    }

    for (const id of GATE_PLATFORM_IDS) {
        if (!gate.platforms[id]) {
            gate.platforms[id] = {
                consecutive_passes: 0,
                last_results: [],
            };
        }
    }

    return gate;
}

function computeGatePassed(gate) {
    const required = gate.required_consecutive || 5;

    return GATE_PLATFORM_IDS.every(
        (id) => (gate.platforms[id]?.consecutive_passes || 0) >= required,
    );
}

function verifyStructuralContracts() {
    const orchestrator = readFileSync(ORCHESTRATOR, 'utf8');
    const content = readFileSync(CONTENT, 'utf8');
    const platforms = readFileSync(PLATFORMS, 'utf8');
    const totaljobs = readFileSync(TOTALJOBS, 'utf8');

    assert(
        !orchestrator.includes('LINKEDIN_PREFILL_CONTACT'),
        'orchestrator must not call LINKEDIN_PREFILL_CONTACT',
    );
    assert(
        !orchestrator.includes('LINKEDIN_FILL_AND_ADVANCE'),
        'orchestrator must not call LINKEDIN_FILL_AND_ADVANCE',
    );
    assert(
        orchestrator.includes('pauseForIdentityConfirm'),
        'Indeed identity mutation must pause for confirmation',
    );
    assert(
        !orchestrator.includes('Open a job board tab in the browser window where AutoCVApply is open'),
        'Auto Apply should not block start when the Assist window has no job board tab',
    );
    assert(
        orchestrator.includes('in the browser window where AutoCVApply is open'),
        'Auto Apply should prefer the side panel host window when the active tab is not on the job board',
    );
    assert(
        !orchestrator.includes('No job board tab in the Assist window - running Auto Apply in a background window.'),
        'Auto Apply must not open a background window when a valid host window exists',
    );
    assert(
        orchestrator.includes('resolveDraftAllStepTimeoutMs'),
        'Draft All step timeout must scale with field count',
    );
    assert(
        !content.includes('LINKEDIN_PREFILL_CONTACT'),
        'content script must not handle LINKEDIN_PREFILL_CONTACT',
    );
    assert(
        content.includes('LINKEDIN_RECOVER_EMPTY_SHELL'),
        'LinkedIn empty-shell recovery message must remain available',
    );

    const claimedIds = [
        'LINKEDIN_PLATFORM_ID',
        'INDEED_PLATFORM_ID',
        'TOTALJOBS_PLATFORM_ID',
        'GLASSDOOR_PLATFORM_ID',
        'REED_PLATFORM_ID',
        'SIMPLYHIRED_PLATFORM_ID',
        'CV_LIBRARY_PLATFORM_ID',
    ];

    for (const symbol of claimedIds) {
        assert(platforms.includes(symbol), `auto-apply-platforms.js must register ${symbol}`);
    }

    assert(
        totaljobs.includes('#ccmgt_explicit_accept'),
        'Totaljobs cookie consent must handle Stepstone ccmgt accept control',
    );
}

function recordResult(platform, result, jobLabel = '') {
    const gate = ensurePlatformBuckets(loadGate());
    const bucket = gate.platforms[platform];

    if (!bucket) {
        throw new Error(`Unknown platform: ${platform}`);
    }

    const normalized = {
        result,
        job: jobLabel || null,
        ts: new Date().toISOString(),
    };

    bucket.last_results = [normalized, ...bucket.last_results].slice(0, 10);

    if (result === 'pass') {
        bucket.consecutive_passes += 1;
    } else {
        bucket.consecutive_passes = 0;
    }

    gate.updated_at = normalized.ts;
    gate.gate_passed = computeGatePassed(gate);

    saveGate(gate);

    return gate;
}

verifyStructuralContracts();

if (args.record) {
    const gate = recordResult(args.record, args.result || 'pass', args.job || '');
    const bucket = gate.platforms[args.record];
    const summary = GATE_PLATFORM_IDS.map(
        (id) => `${id} ${gate.platforms[id].consecutive_passes}/${gate.required_consecutive}`,
    ).join(' · ');

    console.log(
        `Recorded ${args.record} ${args.result || 'pass'} (${bucket.consecutive_passes}/${gate.required_consecutive} consecutive). Gate passed: ${gate.gate_passed}`,
    );
    console.log(summary);
} else {
    const gate = ensurePlatformBuckets(loadGate());
    saveGate(gate);

    console.log('auto-apply reliability gate structural checks passed');
    console.log(
        GATE_PLATFORM_IDS.map(
            (id) => `${id} ${gate.platforms[id].consecutive_passes}/${gate.required_consecutive}`,
        ).join(' · ') + ` · gate_passed=${gate.gate_passed}`,
    );
}
