#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    normalizeBlacklistText,
    parseBlacklistRules,
    evaluateJobAgainstBlacklist,
    JOB_BLACKLIST_MAX_LENGTH,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-blacklist.js')).href
);

test('normalizeBlacklistText trims, normalizes newlines, and caps length', () => {
    assert.equal(normalizeBlacklistText(null), '');
    assert.equal(normalizeBlacklistText('  hello\r\nworld  '), 'hello\nworld');
    assert.equal(
        normalizeBlacklistText('x'.repeat(JOB_BLACKLIST_MAX_LENGTH + 50)).length,
        JOB_BLACKLIST_MAX_LENGTH,
    );
});

test('empty blacklist never blocks', () => {
    assert.deepEqual(
        evaluateJobAgainstBlacklist({
            blacklistText: '',
            title: 'Construction Manager',
            company: 'Microsoft',
            description: 'Build houses',
            location: 'London',
        }),
        { blocked: false, reason: '' },
    );
    assert.deepEqual(
        evaluateJobAgainstBlacklist({
            blacklistText: '   \n  ',
            title: 'Engineer',
            company: 'Acme',
        }),
        { blocked: false, reason: '' },
    );
});

test('blocks exact quoted company names', () => {
    const result = evaluateJobAgainstBlacklist({
        blacklistText: 'avoid "Microsoft" and Meta',
        title: 'Software Engineer',
        company: 'Microsoft',
        description: 'Cloud platform',
        location: 'Remote',
    });

    assert.equal(result.blocked, true);
    assert.match(result.reason, /employer matches/i);
});

test('blocks no X jobs title phrases', () => {
    const result = evaluateJobAgainstBlacklist({
        blacklistText: 'no construction jobs and avoid Microsoft',
        title: 'Construction Site Supervisor',
        company: 'Local Build Ltd',
        description: 'Supervise site',
        location: 'Manchester',
    });

    assert.equal(result.blocked, true);
    assert.match(result.reason, /title matches/i);
});

test('blocks employer keyword without inventing partial soft matches', () => {
    assert.equal(
        evaluateJobAgainstBlacklist({
            blacklistText: 'soft',
            title: 'Engineer',
            company: 'Microsoft',
        }).blocked,
        false,
    );

    const blocked = evaluateJobAgainstBlacklist({
        blacklistText: 'Amazon',
        title: 'Warehouse Associate',
        company: 'Amazon UK',
    });

    assert.equal(blocked.blocked, true);
    assert.match(blocked.reason, /employer matches/i);
});

test('blocks description and location phrases', () => {
    assert.equal(
        evaluateJobAgainstBlacklist({
            blacklistText: 'gambling',
            title: 'Analyst',
            company: 'FinCo',
            description: 'Support our gambling platform operations',
        }).blocked,
        true,
    );

    assert.equal(
        evaluateJobAgainstBlacklist({
            blacklistText: 'avoid Dubai',
            title: 'Engineer',
            company: 'Acme',
            location: 'Dubai, UAE',
        }).blocked,
        true,
    );
});

test('parseBlacklistRules extracts quoted and avoid clauses', () => {
    const rules = parseBlacklistRules('no construction jobs and avoid "Acme Corp"');
    const phrases = rules.map((rule) => rule.phrase);

    assert.ok(phrases.includes('construction'));
    assert.ok(phrases.includes('acme corp'));
});

test('evaluateJobAgainstBlacklist never throws on bad input', () => {
    assert.deepEqual(evaluateJobAgainstBlacklist(undefined), {
        blocked: false,
        reason: '',
    });
    assert.deepEqual(
        evaluateJobAgainstBlacklist({
            blacklistText: { weird: true },
            title: 12,
            company: null,
        }),
        { blocked: false, reason: '' },
    );
});
