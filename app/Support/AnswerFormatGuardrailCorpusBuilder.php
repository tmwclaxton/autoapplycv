<?php

namespace App\Support;

/**
 * Assembles the answer-format-guardrails corpus from curated static scenario JSON
 * plus the shared senior_laravel_dev persona. Does not invent question text.
 */
class AnswerFormatGuardrailCorpusBuilder
{
    /**
     * @return array<string, mixed>
     */
    public static function build(): array
    {
        $persona = self::persona();
        $scenarios = AnswerFormatGuardrailScenarioData::scenarios();

        return [
            'version' => 1,
            'assembled_at' => now()->toIso8601String(),
            'persona_key' => AnswerFormatGuardrailCorpus::PERSONA_KEY,
            'scenario_count' => count($scenarios),
            'profile_persona' => $persona,
            'job_context' => [
                'title' => 'Senior Laravel Engineer',
                'company' => 'StackForge',
                'location' => 'Bristol, United Kingdom (hybrid)',
                'description_snippet' => 'Build billing and API services with Laravel, Vue, and PostgreSQL. Hybrid in Bristol. Competitive UK salary.',
            ],
            'scenarios' => $scenarios,
        ];
    }

    public static function writeJsonFile(?string $path = null): void
    {
        $path ??= base_path(AnswerFormatGuardrailCorpus::CORPUS_PATH);
        $corpus = self::build();
        $directory = dirname($path);

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        file_put_contents(
            $path,
            json_encode($corpus, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n",
        );
    }

    /**
     * @return array<string, mixed>
     */
    public static function persona(): array
    {
        $path = base_path('scripts/extension-benchmark/answer-quality-personas.json');

        if (! is_file($path)) {
            throw new \RuntimeException('Missing answer-quality-personas.json');
        }

        $personas = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        $key = AnswerFormatGuardrailCorpus::PERSONA_KEY;

        if (! is_array($personas[$key] ?? null)) {
            throw new \RuntimeException("Missing persona {$key} in answer-quality-personas.json");
        }

        return $personas[$key];
    }
}
