#!/usr/bin/env node
/**
 * Auto Apply live-review MCP poll ledger.
 * Loads queue/status JSON, runs one scenario via extension bridge, appends results.
 *
 * Usage:
 *   node scripts/extension-test/auto-apply-live-review.mjs --scenario=p0-01
 *   node scripts/extension-test/auto-apply-live-review.mjs --next
 *   node scripts/extension-test/auto-apply-live-review.mjs --offline-p0-10
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildJobSearchUrl } from '../../extension/src/shared/auto-apply-platforms.js';
import {
    buildScenarioStartFilters,
    resolveAccurateMaxApplications,
} from '../../extension/src/shared/auto-apply-start-filters.js';
import { buildGlassdoorJobSearchUrl } from '../../extension/src/shared/glassdoor-platform.js';
import { buildIndeedJobSearchUrl } from '../../extension/src/shared/indeed-platform.js';
import { resolveSessionMarket } from '../../extension/src/shared/job-board-market.js';

const ROOT = join(import.meta.dirname, '../..');
const STATUS_PATH = join(ROOT, 'tests/fixtures/auto-apply/auto-apply-live-review-status.json');
const QUEUE_PATH = join(ROOT, 'tests/fixtures/auto-apply/auto-apply-live-review-queue.json');
const PERSONAS_PATH = join(ROOT, 'tests/fixtures/auto-apply/test-personas.json');
const CONNECTIONS_PATH = join(ROOT, 'storage/app/testing/test-persona-connections.json');
const BRIDGE = process.env.EXTENSION_BRIDGE_URL || 'http://127.0.0.1:7433';
const INSTANCE_ID = process.env.EXTENSION_BRIDGE_INSTANCE_ID || null;
const POLL_MS = Number(process.env.AUTO_APPLY_POLL_MS || 2500);
const RUN_TIMEOUT_MS = Number(process.env.AUTO_APPLY_SCENARIO_TIMEOUT_MS || 12 * 60 * 1000);

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');

        return [key, value ?? 'true'];
    }),
);

const ACCURATE = args.accurate !== 'false';

function loadJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(path, data) {
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function nowLondonIso() {
    return new Date().toISOString();
}

async function bridgeFetch(path, options = {}) {
    const response = await fetch(`${BRIDGE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `Bridge HTTP ${response.status}`);
    }

    return body;
}

async function bridgeCommand(action, params = {}, timeoutMs = 120000) {
    const payload = { action, params, timeoutMs };

    if (INSTANCE_ID) {
        payload.instanceId = INSTANCE_ID;
    }

    const body = await bridgeFetch('/command', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    return body.result;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickScenario(queue, scenarioId, next) {
    if (scenarioId) {
        return queue.entries.find((entry) => entry.id === scenarioId) || null;
    }

    if (next) {
        return queue.entries
            .filter((entry) => entry.queue_status === 'pending')
            .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id.localeCompare(b.id))[0] || null;
    }

    return null;
}

function expectedHost(platform, market, location) {
    const resolved = resolveSessionMarket({ market, location });

    if (platform === 'indeed') {
        return buildIndeedJobSearchUrl('test', { filters: { market, location } }).match(/^https:\/\/([^/]+)/)?.[1];
    }

    if (platform === 'glassdoor') {
        return buildGlassdoorJobSearchUrl('test', { filters: { market, location } }).match(/^https:\/\/([^/]+)/)?.[1];
    }

    if (platform === 'simplyhired') {
        return buildJobSearchUrl('simplyhired', 'test', { filters: { market, location } }).match(/^https:\/\/([^/]+)/)?.[1];
    }

    return resolved;
}

function runOfflineP010() {
    const cases = [
        { platform: 'indeed', market: 'auto', location: 'San Jose CA USA', expect: 'www.indeed.com' },
        { platform: 'indeed', market: 'us', location: '', expect: 'www.indeed.com', label: 'p0-08 explicit US empty location' },
    { platform: 'indeed', market: 'us', location: 'San Jose, CA', expect: 'www.indeed.com', label: 'p0-02 explicit US with location' },
        { platform: 'indeed', market: 'auto', location: 'London', expect: 'uk.indeed.com' },
        { platform: 'glassdoor', market: 'auto', location: 'San Jose CA USA', expect: 'www.glassdoor.com' },
        { platform: 'glassdoor', market: 'uk', location: 'London', expect: 'www.glassdoor.co.uk' },
    ];

    const failures = [];

    for (const testCase of cases) {
        const host = expectedHost(testCase.platform, testCase.market, testCase.location);

        if (host !== testCase.expect) {
            failures.push({ ...testCase, actual: host });
        }
    }

    return {
        result: failures.length === 0 ? 'pass' : 'fail',
        failures,
    };
}

function appendScenarioResult(status, queue, scenario, resultRow) {
    status.scenarios_tested = status.scenarios_tested || [];
    status.scenarios_tested.push(resultRow);
    status.scenarios_tested_count = status.scenarios_tested.length;
    status.updated_at = nowLondonIso();

    if (resultRow.jobs_submitted) {
        status.jobs_submitted_count = (status.jobs_submitted_count || 0) + resultRow.jobs_submitted;
    }

    if (resultRow.jobs_attempted) {
        status.jobs_attempted_count = (status.jobs_attempted_count || 0) + resultRow.jobs_attempted;
    }

    const platform = scenario.platform;
    status.platform_summary = status.platform_summary || {};
    status.platform_summary[platform] = status.platform_summary[platform] || { pass: 0, fail: 0, blocked: 0 };
    status.platform_summary[platform][resultRow.result] = (status.platform_summary[platform][resultRow.result] || 0) + 1;

    const queueEntry = queue.entries.find((entry) => entry.id === scenario.id);

    if (queueEntry) {
        queueEntry.queue_status = resultRow.result === 'pass' ? 'passed' : resultRow.result === 'blocked' ? 'blocked' : 'failed';
        queueEntry.tested_live = true;
        queueEntry.reviewed_at = nowLondonIso();
    }

    queue.pending_count = queue.entries.filter((entry) => entry.queue_status === 'pending').length;
}

function extractSkipReasons(log = []) {
    return log
        .filter((entry) => /skipped/i.test(String(entry.message || '')))
        .map((entry) => entry.message);
}

function extractSearchUrlFromLog(log = []) {
    for (const entry of log) {
        const match = String(entry.message || '').match(/https:\/\/[^\s]+/);

        if (match) {
            return match[0];
        }
    }

    return null;
}

function requiresSubmitVerification(scenario) {
    if (scenario.scenario_type === 'single_apply') {
        return true;
    }

    if (['p0-01', 'p0-02', 'p0-04', 'p0-05', 'p0-11', 'p0-12'].includes(scenario.id)) {
        return true;
    }

    return scenario.tier === 'P0' && /submit|apply step|deep trace|David/i.test(String(scenario.notes || ''));
}

function evaluateAccurateResult(scenario, endSession, expectedHostName, searchUrlActual) {
    const stats = endSession?.stats || {};
    const applied = stats.applied || 0;
    const errors = stats.errors || 0;
    const terminalState = endSession?.status;
    const skipReasons = extractSkipReasons(endSession?.log || []);
    const hostOk = !expectedHostName || String(searchUrlActual || '').includes(expectedHostName);
    /** @type {string[]} */
    const accuracyNotes = [];

    if (!hostOk) {
        accuracyNotes.push(`FAIL FAST: expected host ${expectedHostName}, got ${searchUrlActual || 'unknown'}`);
    } else {
        accuracyNotes.push(`Search host verified: ${expectedHostName}`);
    }

    if (errors > 0 || terminalState === 'error') {
        accuracyNotes.push(`Session ended with errors (${errors}) or status ${terminalState}`);

        return { result: 'fail', accuracy_notes: accuracyNotes, skip_reasons: skipReasons };
    }

    if (scenario.scenario_type === 'search_verify' || scenario.scenario_type === 'negative_test') {
        if (!hostOk) {
            return { result: 'fail', accuracy_notes: accuracyNotes, skip_reasons: skipReasons };
        }

        if (requiresSubmitVerification(scenario)) {
            accuracyNotes.push('David/P0 repro requires submit verification - host-only is insufficient.');
        } else {
            accuracyNotes.push('Routing-only scenario: host check is sufficient for pass.');

            return { result: 'pass', accuracy_notes: accuracyNotes, skip_reasons: skipReasons };
        }
    }

    if (applied > 0) {
        accuracyNotes.push(`Submit confirmed: stats.applied=${applied}`);

        return { result: 'pass', accuracy_notes: accuracyNotes, skip_reasons: skipReasons };
    }

    if ((stats.skipped || 0) > 0 && skipReasons.length > 0) {
        accuracyNotes.push(`No submit; ${stats.skipped} skips with auditable reasons logged.`);
    }

    if (scenario.tier === 'P0' && (stats.found || 0) > 0 && applied === 0) {
        accuracyNotes.push('P0 apply not verified - marking blocked rather than false pass.');
    }

    return {
        result: 'blocked',
        blocked_reason: applied === 0 ? 'no_submit_verified' : 'unknown',
        accuracy_notes: accuracyNotes,
        skip_reasons: skipReasons,
    };
}

async function runLiveScenario(scenario, personas, connections) {
    const persona = personas.personas?.[scenario.persona_id];
    const connection = (connections.connections || []).find((row) => row.persona_id === scenario.persona_id);

    if (!persona) {
        throw new Error(`Unknown persona_id: ${scenario.persona_id}`);
    }

    const bridgeStatus = await bridgeFetch('/status');
    statusBridgeConnected(bridgeStatus);

    if (!bridgeStatus.extensionConnected) {
        return {
            result: 'blocked',
            blocked_reason: 'extension_not_connected',
            persona_id: scenario.persona_id,
            profile_email: persona.email,
        };
    }

    const filters = buildScenarioStartFilters(scenario);
    const maxApplications = resolveAccurateMaxApplications(scenario, { accurate: ACCURATE });

    const startPayload = {
        platform: scenario.platform,
        roleDescription: scenario.role,
        maxApplications,
        fitCheckEnabled: scenario.fit === 'on',
        minFitScore: scenario.fit_min || 10,
        filters,
        force: args.force === 'true',
    };

    console.log(`[accurate] maxApplications=${maxApplications} filters=${JSON.stringify(filters)}`);

    const started = await bridgeCommand('start_auto_apply', startPayload, 180000);
    const session = started.session;
    const expectedHostName = expectedHost(scenario.platform, scenario.market || 'auto', scenario.location || '');
    const searchUrlActual = session?.searchUrl
        || extractSearchUrlFromLog(session?.log || [])
        || session?.currentUrl
        || null;

    if (expectedHostName && searchUrlActual && !String(searchUrlActual).includes(expectedHostName)) {
        await bridgeCommand('auto_apply_stop', {}, 30000);

        return {
            result: 'fail',
            fail_reason: 'search_host_mismatch',
            market_setting: scenario.market || 'auto',
            market_resolved: resolveSessionMarket({ market: scenario.market || 'auto', location: scenario.location || '' }),
            search_url_expected_host: expectedHostName,
            search_url_actual: searchUrlActual,
            persona_id: scenario.persona_id,
            profile_email: persona.email,
            connection_available: Boolean(connection?.token),
            accuracy_notes: [`FAIL FAST: expected ${expectedHostName}, actual ${searchUrlActual}`],
        };
    }

    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let lastLogLength = 0;
    let finalStatus = null;

    while (Date.now() < deadline) {
        finalStatus = await bridgeCommand('auto_apply_status', {}, 30000);
        const currentSession = finalStatus.session;
        const log = currentSession?.log || [];

        if (log.length > lastLogLength) {
            for (const entry of log.slice(lastLogLength)) {
                console.log(`[log] ${entry.message}`);
            }

            lastLogLength = log.length;
        }

        const state = currentSession?.status;

        if (!finalStatus.running && (state === 'completed' || state === 'stopped' || state === 'error')) {
            break;
        }

        await sleep(POLL_MS);
    }

    const endSession = finalStatus?.session;
    const finalSearchUrl = endSession?.searchUrl || searchUrlActual || extractSearchUrlFromLog(endSession?.log || []);
    const evaluation = evaluateAccurateResult(scenario, endSession, expectedHostName, finalSearchUrl);

    return {
        ...evaluation,
        persona_id: scenario.persona_id,
        profile_email: persona.email,
        market_setting: scenario.market || 'auto',
        market_resolved: resolveSessionMarket({ market: scenario.market || 'auto', location: scenario.location || '' }),
        search_url_expected_host: expectedHostName,
        search_url_actual: finalSearchUrl,
        jobs_submitted: endSession?.stats?.applied || 0,
        jobs_attempted: endSession?.stats?.found || 0,
        session_status: endSession?.status,
        stats: endSession?.stats || null,
        connection_available: Boolean(connection?.token),
        accurate_mode: ACCURATE,
        max_applications_used: maxApplications,
    };
}

function statusBridgeConnected(bridgeStatus) {
    if (typeof bridgeStatus?.extensionConnected === 'boolean') {
        const status = loadJson(STATUS_PATH);
        status.bridge_connected = bridgeStatus.extensionConnected;
        status.extension_version = bridgeStatus.extensionVersion || status.extension_version || null;
        saveJson(STATUS_PATH, status);
    }
}

async function main() {
    const status = loadJson(STATUS_PATH);
    const queue = loadJson(QUEUE_PATH);
    const personas = loadJson(PERSONAS_PATH);

    if (args['offline-p0-10'] === 'true' || args.scenario === 'p0-10') {
        const offline = runOfflineP010();
        const scenario = queue.entries.find((entry) => entry.id === 'p0-10');
        const row = {
            scenario_id: 'p0-10',
            platform: 'offline',
            persona_id: 'uk_software',
            profile_email: personas.personas?.uk_software?.email || null,
            result: offline.result,
            reviewed_at: nowLondonIso(),
            offline_checks: offline.failures,
        };
        appendScenarioResult(status, queue, scenario || { id: 'p0-10', platform: 'offline' }, row);
        saveJson(STATUS_PATH, status);
        saveJson(QUEUE_PATH, queue);
        console.log(JSON.stringify(row, null, 2));
        process.exitCode = offline.result === 'pass' ? 0 : 1;

        return;
    }

    const scenario = pickScenario(queue, args.scenario, args.next === 'true');

    if (!scenario) {
        throw new Error('No scenario found. Pass --scenario=id or --next');
    }

    console.log(`[scenario] ${scenario.id} ${scenario.platform} persona=${scenario.persona_id}`);

    let connections = { connections: [] };

    try {
        connections = loadJson(CONNECTIONS_PATH);
    } catch {
        console.warn('[warn] No persona connections manifest at storage/app/testing/test-persona-connections.json');
    }

    const resultRow = scenario.offline
        ? {
            scenario_id: scenario.id,
            platform: scenario.platform,
            persona_id: scenario.persona_id,
            profile_email: personas.personas?.[scenario.persona_id]?.email || null,
            ...runOfflineP010(),
            reviewed_at: nowLondonIso(),
        }
        : {
            scenario_id: scenario.id,
            platform: scenario.platform,
            reviewed_at: nowLondonIso(),
            ...(await runLiveScenario(scenario, personas, connections)),
        };

    appendScenarioResult(status, queue, scenario, resultRow);
    saveJson(STATUS_PATH, status);
    saveJson(QUEUE_PATH, queue);
    console.log(JSON.stringify(resultRow, null, 2));

    if (resultRow.result !== 'pass') {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`auto-apply-live-review failed: ${error.message}`);
    process.exitCode = 1;
});
