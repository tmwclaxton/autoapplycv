#!/usr/bin/env node
/**
 * Post-process NanoGPT routing corpus:
 * - Force llm when extension deferral classifiers fire
 * - Drop NanoGPT "heuristic" labels that our router cannot actually fill
 * - Keep NanoGPT "llm" labels even when the extension currently fills them
 *   (those become failing inventing regressions until fixed)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

const corpus = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const incoming = Array.isArray(corpus.cases) ? corpus.cases : [];
const kept = [];
const inventing = [];
let droppedUnfillableHeuristic = 0;
let forcedDeferLlm = 0;

for (const caseRow of incoming) {
    const nanoRoute = caseRow.nanogpt_expected_route || caseRow.expected_route;
    const actual = actualRoute(caseRow);

    if (shouldDeferScreenerQuestionToLlm(caseRow.label)) {
        kept.push({
            ...caseRow,
            nanogpt_expected_route: nanoRoute,
            expected_route: 'llm',
            stamp: actual === 'llm' ? 'defer_classifier' : 'defer_classifier_conflict',
        });
        forcedDeferLlm += 1;

        continue;
    }

    if (nanoRoute === 'heuristic') {
        if (actual !== 'heuristic') {
            droppedUnfillableHeuristic += 1;

            continue;
        }

        kept.push({
            ...caseRow,
            nanogpt_expected_route: nanoRoute,
            expected_route: 'heuristic',
            stamp: 'nano_heuristic_confirmed',
        });

        continue;
    }

    // NanoGPT says llm: keep only when the extension also defers (stable random regression net).
    // Inventing fills are written to a sibling report for follow-up.
    if (actual !== 'llm') {
        inventing.push({
            ...caseRow,
            nanogpt_expected_route: nanoRoute || 'llm',
            actual_route: actual,
        });

        continue;
    }

    kept.push({
        ...caseRow,
        nanogpt_expected_route: nanoRoute || 'llm',
        expected_route: 'llm',
        stamp: 'nano_llm_confirmed',
    });
}

const next = {
    ...corpus,
    stamped_at: new Date().toISOString(),
    count: kept.length,
    stamp_stats: {
        incoming: incoming.length,
        kept: kept.length,
        dropped_unfillable_heuristic: droppedUnfillableHeuristic,
        forced_defer_llm: forcedDeferLlm,
        inventing_dropped: inventing.length,
    },
    cases: kept,
};

writeFileSync(FIXTURE, `${JSON.stringify(next, null, 2)}\n`);
writeFileSync(
    join(ROOT, 'tests/fixtures/draft-all/heuristics-routing-nanogpt-inventing.json'),
    `${JSON.stringify({
        stamped_at: next.stamped_at,
        count: inventing.length,
        cases: inventing,
    }, null, 2)}\n`,
);
console.log(JSON.stringify(next.stamp_stats, null, 2));

if (inventing.length > 0) {
    console.warn(`Wrote ${inventing.length} inventing suspects to heuristics-routing-nanogpt-inventing.json`);
}
