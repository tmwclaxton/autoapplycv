#!/usr/bin/env node
/**
 * Build optional NanoGPT scoring scenarios for syn-ai-* fixtures.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, FIXTURE_ROOT } from './lib/paths.mjs';
import { selectScoringQuestions } from './lib/scoring-questions.mjs';

const OUTPUT_PATH = join(FIXTURE_ROOT, '../extension-e2e/ai-form-scoring-scenarios.json');
const limit = assertBatchLimit(parseLimitArg() ?? 50);

function main() {
    const manifest = loadManifest();
    const scenarios = manifest.scenarios
        .filter((row) => row.id.startsWith('syn-ai-') && row.status !== 'draft')
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);

    const built = [];

    for (const scenario of scenarios) {
        const expectedPath = join(EXPECTED_DIR, `${scenario.id}.json`);

        if (!existsSync(expectedPath)) {
            continue;
        }

        const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
        const questions = selectScoringQuestions(expected.fields || [], { maxQuestions: 6 });

        if (questions.length === 0) {
            continue;
        }

        built.push({
            fixture_id: scenario.id,
            page_title: scenario.page_title || scenario.id,
            questions,
        });
    }

    mkdirSync(join(FIXTURE_ROOT, '../extension-e2e'), { recursive: true });
    const payload = {
        generated_at: new Date().toISOString(),
        model_config_key: 'cv.form_corpus_ai_model',
        scenario_count: built.length,
        scenarios: built,
    };

    writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify({ output: OUTPUT_PATH, scenario_count: built.length }, null, 2));
}

main();
