#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAnswerQualityCorpus } from './build-answer-quality-corpus.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function loadCorpus() {
    const jsonPath = join(process.cwd(), 'scripts/extension-benchmark/answer-quality-corpus.json');

    try {
        const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));

        if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
            return parsed;
        }
    } catch {
        // Fall back to generated corpus when JSON has not been built yet.
    }

    return buildAnswerQualityCorpus();
}

const corpus = loadCorpus();

assert(corpus.version === 1, 'Corpus version must be 1');
assert(Array.isArray(corpus.scenarios), 'Corpus must include scenarios');
assert(corpus.scenarios.length >= 100, `Expected at least 100 scenarios, got ${corpus.scenarios.length}`);
assert(corpus.profile_personas && Object.keys(corpus.profile_personas).length >= 8, 'Expected at least 8 personas');

const ids = new Set();

for (const scenario of corpus.scenarios) {
    assert(typeof scenario.id === 'string' && scenario.id.length > 0, 'Scenario id required');
    assert(!ids.has(scenario.id), `Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);

    assert(typeof scenario.profile_fixture === 'string', `${scenario.id}: profile_fixture required`);
    assert(corpus.profile_personas[scenario.profile_fixture], `${scenario.id}: unknown persona`);
    assert(scenario.job_context?.title, `${scenario.id}: job title required`);
    assert(Array.isArray(scenario.questions) && scenario.questions.length > 0, `${scenario.id}: questions required`);

    for (const question of scenario.questions) {
        assert(typeof question.label === 'string' && question.label.length > 0, `${scenario.id}: question label required`);
        assert(typeof question.ref === 'string' && question.ref.length > 0, `${scenario.id}: question ref required`);
    }
}

console.log(`answer-quality corpus tests passed (${corpus.scenarios.length} scenarios, ${Object.keys(corpus.profile_personas).length} personas)`);
