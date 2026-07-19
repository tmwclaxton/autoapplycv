#!/usr/bin/env node
/**
 * Runs NanoGPT-generated Draft All routing cases from
 * tests/fixtures/draft-all/heuristics-routing-nanogpt.json
 *
 * Regenerate:
 *   npm run test:heuristics-vs-nanogpt:generate
 * Smoke (small concurrent sample):
 *   npm run test:heuristics-vs-nanogpt:generate:smoke
 *
 * ROUTING_CORPUS_MIN overrides the minimum case count (default 500).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = join(ROOT, 'tests/fixtures/draft-all/heuristics-routing-nanogpt.json');

const {
    resolveHeuristicScreenerAnswer,
    shouldDeferScreenerQuestionToLlm,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-screener-answer.js')).href);
const { buildDraftAllApplyPlan } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/pipeline.js')).href
);

const FULL_PROFILE = {
    full_name: 'Toby Claxton',
    email: 'toby@example.com',
    phone: '07700900123',
    city: 'Belfast',
    country: 'United Kingdom',
    profile: { country: 'United Kingdom' },
    application_settings: {
        phone_country_code: '+44',
        years_of_experience: '7',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        notice_period: '4 weeks',
        expected_salary_yearly: '85000',
        affirm_local_commute: 'yes',
        affirm_local_hybrid: 'yes',
        willing_to_relocate: 'no',
    },
};

function loadCorpus() {
    let raw;

    try {
        raw = readFileSync(FIXTURE, 'utf8');
    } catch {
        throw new Error(
            `Missing ${FIXTURE}. Generate with: php artisan draft-all:generate-routing-corpus --count=500`,
        );
    }

    return JSON.parse(raw);
}

function actualRoute(caseRow) {
    const field = {
        ref: caseRow.id || `ref-${Math.random().toString(36).slice(2, 8)}`,
        label: caseRow.label,
        field_type: caseRow.field_type || 'text',
        type: caseRow.field_type || 'text',
        options: caseRow.options ?? null,
    };

    if (shouldDeferScreenerQuestionToLlm(caseRow.label)) {
        return 'llm';
    }

    const plan = buildDraftAllApplyPlan({
        fields: [field],
        profileData: FULL_PROFILE,
        questionMemo: {},
        platformId: 'indeed',
    });

    const applied = plan.applyStages.some((stage) => stage.answers.some((answer) => (
        answer.ref === field.ref || answer.label === caseRow.label
    )));

    if (applied) {
        return 'heuristic';
    }

    const heuristic = resolveHeuristicScreenerAnswer(field, FULL_PROFILE, null, { platformId: 'indeed' });

    if (heuristic != null && String(heuristic).trim() !== '') {
        return 'heuristic';
    }

    return 'llm';
}

const corpus = loadCorpus();
const cases = Array.isArray(corpus.cases) ? corpus.cases : [];
const minCases = Math.max(1, Number.parseInt(process.env.ROUTING_CORPUS_MIN || '500', 10) || 500);

test('NanoGPT routing corpus has the expected JSON shape', () => {
    assert.equal(typeof corpus.model, 'string');
    assert.ok(Number.isFinite(Number(corpus.seed)));
    assert.ok(Array.isArray(corpus.cases));
    assert.ok(cases.length >= 1, 'corpus.cases must not be empty');

    for (const caseRow of cases) {
        assert.equal(typeof caseRow.id, 'string', 'case.id');
        assert.ok(String(caseRow.label || '').trim() !== '', `case ${caseRow.id} label`);
        assert.ok(
            ['heuristic', 'llm'].includes(caseRow.expected_route),
            `case ${caseRow.id} expected_route`,
        );
        assert.ok(
            ['text', 'textarea', 'radio', 'select', 'number', 'checkbox', 'tel', 'email'].includes(
                caseRow.field_type,
            ),
            `case ${caseRow.id} field_type=${caseRow.field_type}`,
        );

        if (caseRow.options != null) {
            assert.ok(Array.isArray(caseRow.options), `case ${caseRow.id} options`);
        }
    }
});

test(`NanoGPT-generated routing corpus has at least ${minCases} cases (got ${cases.length})`, () => {
    assert.ok(
        cases.length >= minCases,
        `expected >= ${minCases} cases, got ${cases.length}. Regenerate corpus.`,
    );
});

test(`NanoGPT-generated routing matches extension router (${cases.length} cases)`, () => {
    const mismatches = [];

    for (const caseRow of cases) {
        const expected = caseRow.expected_route;
        const actual = actualRoute(caseRow);

        if (expected !== actual) {
            mismatches.push({
                id: caseRow.id,
                label: caseRow.label,
                category: caseRow.category,
                expected,
                actual,
                reason: caseRow.reason,
            });
        }
    }

    if (mismatches.length > 0) {
        const preview = mismatches.slice(0, 15).map((row) => (
            `${row.id}: expected=${row.expected} actual=${row.actual} :: ${row.label}`
        )).join('\n');

        assert.fail(
            `${mismatches.length}/${cases.length} routing mismatches\n${preview}`,
        );
    }
});

console.log(
    `loaded NanoGPT routing corpus: ${cases.length} cases (model=${corpus.model || '?'}, seed=${corpus.seed || '?'})`,
);
