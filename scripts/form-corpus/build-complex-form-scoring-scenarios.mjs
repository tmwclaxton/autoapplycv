#!/usr/bin/env node
/**
 * Build scoring scenarios for syn-complex-500-* fixtures.
 *
 * Usage:
 *   node scripts/form-corpus/build-complex-form-scoring-scenarios.mjs
 *   node scripts/form-corpus/build-complex-form-scoring-scenarios.mjs --count=500
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR } from './lib/paths.mjs';
import { selectScoringQuestions } from './lib/scoring-questions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PERSONAS_PATH = join(ROOT, 'scripts/extension-benchmark/answer-quality-personas.json');
const OUT_PATH = join(ROOT, 'tests/fixtures/extension-e2e/complex-form-scoring-scenarios.json');
const ID_PREFIX = 'syn-complex-500-';

const TARGET_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] || 500);
const MAX_QUESTIONS = Number(process.argv.find((arg) => arg.startsWith('--max-questions='))?.split('=')[1] || 3);

function loadExpected(id) {
    const path = join(EXPECTED_DIR, `${id}.json`);

    if (!existsSync(path)) {
        return null;
    }

    return JSON.parse(readFileSync(path, 'utf8'));
}

function detectPlatform(scenario) {
    const category = scenario.category || '';

    if (category.includes('greenhouse')) {
        return 'greenhouse';
    }

    if (category.includes('ashby')) {
        return 'ashby';
    }

    if (category.includes('lever')) {
        return 'lever';
    }

    if (category.includes('smartrecruiters')) {
        return 'smartrecruiters';
    }

    if (category.includes('workday')) {
        return 'workday';
    }

    return 'syn-complex';
}

function fieldTypeSummary(fields) {
    return [...new Set(fields.map((field) => field.field_type || 'text'))].sort();
}

function main() {
    const manifest = loadManifest();
    const personas = JSON.parse(readFileSync(PERSONAS_PATH, 'utf8'));
    const personaKeys = Object.keys(personas);

    if (personaKeys.length === 0) {
        console.error('No profile personas found.');
        process.exit(1);
    }

    const candidates = manifest.scenarios
        .filter((scenario) => scenario.id?.startsWith(ID_PREFIX))
        .sort((left, right) => left.id.localeCompare(right.id));

    const picked = [];
    const platformCounts = {};
    let personaIndex = 0;

    for (const scenario of candidates) {
        if (picked.length >= TARGET_COUNT) {
            break;
        }

        const expected = loadExpected(scenario.id);

        if (!expected?.fields?.length) {
            continue;
        }

        const questions = selectScoringQuestions(expected.fields, MAX_QUESTIONS);

        if (questions.length === 0) {
            continue;
        }

        const platform = detectPlatform(scenario);
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;

        picked.push({
            id: scenario.id,
            platform,
            profile_persona: personaKeys[personaIndex % personaKeys.length],
            field_count: expected.fields.length,
            field_types: fieldTypeSummary(expected.fields),
            question_count: questions.length,
            questions,
            page_title: scenario.page_title || null,
            page_url: scenario.page_url || null,
        });

        personaIndex += 1;
    }

    const output = {
        version: 1,
        generated_at: new Date().toISOString(),
        description: 'Complex synthetic form answer scoring scenarios (syn-complex-500-*). Sail-only live tier.',
        id_prefix: ID_PREFIX,
        target_count: TARGET_COUNT,
        scenario_count: picked.length,
        persona_count: personaKeys.length,
        platform_counts: platformCounts,
        scenarios: picked,
    };

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

    console.log(`Wrote ${picked.length} complex scoring scenarios -> ${OUT_PATH}`);
    console.log('Platforms:', JSON.stringify(platformCounts));
}

main();
