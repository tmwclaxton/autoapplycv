#!/usr/bin/env node
/**
 * LinkedIn + Indeed reliability gate tracker.
 *
 * Offline structural checks (default):
 *   node scripts/extension-test/auto-apply-reliability-gate.mjs
 *
 * Record a live scenario result after MCP HTML verification:
 *   node scripts/extension-test/auto-apply-reliability-gate.mjs --record=linkedin --result=pass --job="Title @ Co"
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE_PATH = join(ROOT, 'tests/fixtures/auto-apply/auto-apply-reliability-gate.json');
const ORCHESTRATOR = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');
const CONTENT = join(ROOT, 'extension/src/content/index.js');

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

function verifyStructuralContracts() {
    const orchestrator = readFileSync(ORCHESTRATOR, 'utf8');
    const content = readFileSync(CONTENT, 'utf8');

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
        'Auto Apply should fall back to a background window instead of blocking start',
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
}

function recordResult(platform, result, jobLabel = '') {
    const gate = loadGate();
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
    gate.gate_passed =
        gate.platforms.linkedin.consecutive_passes >= gate.required_consecutive
        && gate.platforms.indeed.consecutive_passes >= gate.required_consecutive;

    saveGate(gate);

    return gate;
}

verifyStructuralContracts();

if (args.record) {
    const gate = recordResult(args.record, args.result || 'pass', args.job || '');

    console.log(
        `Recorded ${args.record} ${args.result || 'pass'} (${gate.platforms[args.record].consecutive_passes}/${gate.required_consecutive} consecutive). Gate passed: ${gate.gate_passed}`,
    );
} else {
    const gate = loadGate();

    console.log('auto-apply reliability gate structural checks passed');
    console.log(
        `LinkedIn ${gate.platforms.linkedin.consecutive_passes}/${gate.required_consecutive} · Indeed ${gate.platforms.indeed.consecutive_passes}/${gate.required_consecutive} · gate_passed=${gate.gate_passed}`,
    );
}
