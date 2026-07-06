/**
 * Deterministic answer vetting without NanoGPT: AiPhraseDenylist via PHP + persona grounding samples.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PERSONAS_PATH = join(ROOT, 'scripts/extension-benchmark/answer-quality-personas.json');

function findAiPhraseViolations(answer) {
    const php = join(ROOT, 'scripts/form-corpus/lib/check-ai-phrases.php');

    if (!existsSync(php)) {
        return { hard: [], soft: [], passed: true };
    }

    const result = spawnSync('php', [php, answer], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });

    if (result.status !== 0 || !result.stdout?.trim()) {
        return { hard: [], soft: [], passed: true, error: result.stderr || 'php check failed' };
    }

    try {
        return JSON.parse(result.stdout);
    } catch {
        return { hard: [], soft: [], passed: true, error: 'invalid php json' };
    }
}

function sampleAnswerFromPersona(persona, questionLabel) {
    const summary = persona.summary || '';
    const headline = persona.headline || '';
    const experience = Array.isArray(persona.experience) ? persona.experience : [];
    const firstRole = experience[0];
    const roleLine = firstRole
        ? `At ${firstRole.company || 'my previous employer'} I worked as ${firstRole.title || 'an engineer'}.`
        : '';

    return `${summary} ${roleLine} This relates to "${questionLabel}" from my background in ${headline || 'software'}.`.trim();
}

/**
 * @param {Array<{ id: string, profile_persona: string, questions: Array<{ label: string }> }>} scenarios
 * @param {{ sampleSize?: number }} options
 */
export function runDeterministicAnswerVetting(scenarios, options = {}) {
    const sampleSize = options.sampleSize ?? 50;
    const personas = JSON.parse(readFileSync(PERSONAS_PATH, 'utf8'));
    const sampled = scenarios.slice(0, sampleSize);
    const results = [];
    let passed = 0;

    for (const scenario of sampled) {
        const persona = personas[scenario.profile_persona];

        if (!persona) {
            results.push({ id: scenario.id, passed: false, error: `unknown persona ${scenario.profile_persona}` });
            continue;
        }

        const questionResults = [];

        for (const question of scenario.questions || []) {
            const answer = sampleAnswerFromPersona(persona, question.label);
            const violations = findAiPhraseViolations(answer);
            const questionPassed = (violations.hard || []).length === 0;

            questionResults.push({
                ref: question.ref,
                label: question.label,
                passed: questionPassed,
                hard_phrases: violations.hard || [],
                soft_phrases: violations.soft || [],
            });
        }

        const scenarioPassed = questionResults.every((row) => row.passed);
        passed += scenarioPassed ? 1 : 0;

        results.push({
            id: scenario.id,
            profile_persona: scenario.profile_persona,
            passed: scenarioPassed,
            questions: questionResults,
        });
    }

    return {
        sampled: sampled.length,
        passed,
        pass_rate: sampled.length === 0 ? 0 : Number((passed / sampled.length).toFixed(4)),
        results,
    };
}
