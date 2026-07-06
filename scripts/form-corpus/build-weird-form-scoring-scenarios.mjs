#!/usr/bin/env node
/**
 * Build answer-scoring scenarios for syn-weird-* fixtures with open-ended questions.
 *
 * Usage:
 *   node scripts/form-corpus/build-weird-form-scoring-scenarios.mjs
 *   node scripts/form-corpus/build-weird-form-scoring-scenarios.mjs --count=25
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR } from './lib/paths.mjs';
import { selectScoringQuestions } from './lib/scoring-questions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PERSONAS_PATH = join(ROOT, 'scripts/extension-benchmark/answer-quality-personas.json');
const OUT_PATH = join(ROOT, 'tests/fixtures/extension-e2e/weird-form-scoring-scenarios.json');
const ID_PREFIX = 'syn-weird-';

const TARGET_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] || 25);
const MAX_QUESTIONS = Number(process.argv.find((arg) => arg.startsWith('--max-questions='))?.split('=')[1] || 3);

function loadExpected(id) {
    const path = join(EXPECTED_DIR, `${id}.json`);

    if (!existsSync(path)) {
        return null;
    }

    return JSON.parse(readFileSync(path, 'utf8'));
}

function fieldTypeSummary(fields) {
    return [...new Set(fields.map((field) => field.field_type || 'text'))].sort();
}

function diversityScore(scenario, fieldCount, questionCount) {
    let score = fieldCount + questionCount * 5;

    if (scenario.category?.includes('interaction')) {
        score += 4;
    }

    if (scenario.category?.includes('platform')) {
        score += 3;
    }

    return score;
}

function main() {
    const manifest = loadManifest();
    const personas = JSON.parse(readFileSync(PERSONAS_PATH, 'utf8'));
    const personaKeys = Object.keys(personas);

    if (personaKeys.length === 0) {
        console.error('No profile personas found.');
        process.exit(1);
    }

    const candidates = [];

    for (const scenario of manifest.scenarios) {
        if (!scenario.id?.startsWith(ID_PREFIX)) {
            continue;
        }

        if (scenario.status !== 'vetted') {
            continue;
        }

        const expected = loadExpected(scenario.id);

        if (!expected?.fields?.length) {
            continue;
        }

        const questions = selectScoringQuestions(expected.fields, MAX_QUESTIONS);

        if (questions.length === 0) {
            continue;
        }

        candidates.push({
            scenario,
            expected,
            questions,
            score: diversityScore(scenario, expected.fields.length, questions.length),
        });
    }

    candidates.sort((left, right) => right.score - left.score || left.scenario.id.localeCompare(right.scenario.id));

    const picked = [];
    let personaIndex = 0;

    for (const candidate of candidates) {
        if (picked.length >= TARGET_COUNT) {
            break;
        }

        picked.push({
            id: candidate.scenario.id,
            platform: 'syn-weird',
            edge_case: candidate.scenario.notes || null,
            profile_persona: personaKeys[personaIndex % personaKeys.length],
            field_count: candidate.expected.fields.length,
            field_types: fieldTypeSummary(candidate.expected.fields),
            question_count: candidate.questions.length,
            questions: candidate.questions,
            page_title: candidate.scenario.page_title || null,
            page_url: candidate.scenario.page_url || null,
        });

        personaIndex += 1;
    }

    const output = {
        version: 1,
        generated_at: new Date().toISOString(),
        description: 'Hand-crafted edge-case form answer scoring scenarios (syn-weird-*). Sail-only live tier.',
        id_prefix: ID_PREFIX,
        target_count: TARGET_COUNT,
        scenario_count: picked.length,
        persona_count: personaKeys.length,
        scenarios: picked,
    };

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

    console.log(`Wrote ${picked.length} weird scoring scenarios -> ${OUT_PATH}`);
}

main();
