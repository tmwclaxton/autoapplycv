#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const { createInitialSession, isSameAutoApplyRun } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-session.js')).href
);
const { bindAutoApplyRunOwnership } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-run-ownership.js')).href
);

test('createInitialSession assigns a unique runId', () => {
    const a = createInitialSession({ platform: 'reed', roleDescription: 'engineer' });
    const b = createInitialSession({ platform: 'reed', roleDescription: 'engineer' });

    assert.ok(a.runId);
    assert.ok(b.runId);
    assert.notEqual(a.runId, b.runId);
});

test('isSameAutoApplyRun detects platform and runId switches', () => {
    const owner = { runId: 'run-a', platform: 'reed' };

    assert.equal(isSameAutoApplyRun(owner, { runId: 'run-a', platform: 'reed' }), true);
    assert.equal(isSameAutoApplyRun(owner, { runId: 'run-b', platform: 'reed' }), false);
    assert.equal(isSameAutoApplyRun(owner, { runId: 'run-a', platform: 'simplyhired' }), false);
    assert.equal(isSameAutoApplyRun(owner, null), false);
});

test('bindAutoApplyRunOwnership blocks writes after session replacement', async () => {
    const owner = createInitialSession({ platform: 'simplyhired', roleDescription: 'engineer' });
    let latest = { ...owner };
    const writes = [];

    const ctx = {
        loadAutoApplySession: async () => latest,
        updateSession: async (mutator, ownerRunId) => {
            if (ownerRunId != null && latest?.runId !== ownerRunId) {
                return null;
            }

            const next = typeof mutator === 'function' ? mutator(latest) : { ...latest, ...mutator };
            writes.push(next);
            latest = next;

            return next;
        },
        logSession: async (level, message, ownerRunId) =>
            ctx.updateSession((session) => ({
                ...session,
                log: [...(session.log || []), { level, message }],
            }), ownerRunId),
        shouldStop: async (session) => Boolean(session?.stopRequested),
    };

    const bound = bindAutoApplyRunOwnership(owner, ctx);

    await bound.logSession('info', 'owned write');
    assert.equal(writes.length, 1);

    latest = createInitialSession({ platform: 'reed', roleDescription: 'engineer' });

    assert.equal(bound.ownsLatest(latest), false);
    assert.equal(await bound.shouldStop(owner), true);

    const blocked = await bound.logSession('warn', 'zombie write');
    assert.equal(blocked, null);
    assert.equal(writes.length, 1);
    assert.equal(latest.platform, 'reed');
    assert.equal((latest.log || []).length, 0);
});
