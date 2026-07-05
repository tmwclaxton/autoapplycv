#!/usr/bin/env node
/**
 * Build 150 form E2E scoring scenarios: fixture + profile persona + scorable questions.
 *
 * Usage:
 *   node scripts/form-corpus/build-form-e2e-scoring-scenarios.mjs
 *   node scripts/form-corpus/build-form-e2e-scoring-scenarios.mjs --count=150
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPlatform } from './lib/curated-manifest.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR } from './lib/paths.mjs';
import { selectScoringQuestions } from './lib/scoring-questions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PERSONAS_PATH = join(ROOT, 'scripts/extension-benchmark/answer-quality-personas.json');
const OUT_PATH = join(ROOT, 'tests/fixtures/extension-e2e/form-e2e-scoring-scenarios.json');

const TARGET_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] || 150);
const MAX_QUESTIONS = Number(process.argv.find((arg) => arg.startsWith('--max-questions='))?.split('=')[1] || 3);
const MAX_PER_PLATFORM = Number(process.argv.find((arg) => arg.startsWith('--max-per-platform='))?.split('=')[1] || 18);

function loadExpected(id) {
    const path = join(EXPECTED_DIR, `${id}.json`);

    if (!existsSync(path)) {
        return null;
    }

    return JSON.parse(readFileSync(path, 'utf8'));
}

function diversityScore(scenario, fieldCount, questionCount) {
    let score = fieldCount;

    if (questionCount > 0) {
        score += questionCount * 5;
    }

    if (scenario.source === 'firecrawl') {
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
        if (!scenario.id?.startsWith('web-')) {
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
            platform: detectPlatform(scenario),
            fieldCount: expected.fields.length,
            questions,
            diversityScore: diversityScore(scenario, expected.fields.length, questions.length),
        });
    }

    candidates.sort((left, right) => right.diversityScore - left.diversityScore);

    const picked = [];
    const platformCounts = {};
    let personaIndex = 0;

    for (const candidate of candidates) {
        if (picked.length >= TARGET_COUNT) {
            break;
        }

        const platform = candidate.platform || 'unknown';
        const current = platformCounts[platform] || 0;

        if (current >= MAX_PER_PLATFORM && picked.length < TARGET_COUNT - 10) {
            continue;
        }

        const profilePersona = personaKeys[personaIndex % personaKeys.length];
        personaIndex += 1;

        picked.push({
            id: candidate.scenario.id,
            platform,
            profile_persona: profilePersona,
            field_count: candidate.fieldCount,
            question_count: candidate.questions.length,
            questions: candidate.questions,
            page_title: candidate.scenario.page_title || null,
            page_url: candidate.scenario.page_url || candidate.scenario.source_url || null,
        });

        platformCounts[platform] = current + 1;
    }

    if (picked.length < TARGET_COUNT) {
        for (const candidate of candidates) {
            if (picked.length >= TARGET_COUNT) {
                break;
            }

            if (picked.some((row) => row.id === candidate.scenario.id)) {
                continue;
            }

            const profilePersona = personaKeys[personaIndex % personaKeys.length];
            personaIndex += 1;

            picked.push({
                id: candidate.scenario.id,
                platform: candidate.platform || 'unknown',
                profile_persona: profilePersona,
                field_count: candidate.fieldCount,
                question_count: candidate.questions.length,
                questions: candidate.questions,
                page_title: candidate.scenario.page_title || null,
                page_url: candidate.scenario.page_url || candidate.scenario.source_url || null,
            });
        }
    }

    const output = {
        version: 1,
        generated_at: new Date().toISOString(),
        description: 'Form fixture E2E + NanoGPT answer scoring scenarios (Sail-only live tier).',
        target_count: TARGET_COUNT,
        scenario_count: picked.length,
        persona_count: personaKeys.length,
        platform_counts: platformCounts,
        scenarios: picked,
    };

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

    console.log(`Wrote ${picked.length} scoring scenarios → ${OUT_PATH}`);
    console.log('Platforms:', JSON.stringify(platformCounts));
}

main();
