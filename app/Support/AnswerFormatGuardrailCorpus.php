<?php

namespace App\Support;

use App\Models\CvProfile;
use InvalidArgumentException;

class AnswerFormatGuardrailCorpus
{
    public const CORPUS_PATH = 'scripts/extension-benchmark/answer-format-guardrails-corpus.json';

    public const REPORT_PATH = 'tests/fixtures/answer-format-guardrails/latest-report.json';

    public const PERSONA_KEY = 'senior_laravel_dev';

    public const MIN_SCENARIOS = 1000;

    /**
     * @var list<string>
     */
    public const ANSWER_SHAPES = [
        'yes_no',
        'digit',
        'short_number',
        'one_liner',
        'short_paragraph',
        'long_paragraph',
        'url',
        'email',
        'phone',
        'date',
        'currency',
        'select_option',
        'notice_period',
        'percent',
    ];

    /**
     * @var list<string>
     */
    public const BREVITY_LEVELS = [
        'minimal',
        'brief',
        'substance',
    ];

    /**
     * @return array<string, mixed>
     */
    public static function load(): array
    {
        $path = base_path(self::CORPUS_PATH);

        if (! is_file($path)) {
            AnswerFormatGuardrailCorpusBuilder::writeJsonFile($path);

            if (! is_file($path)) {
                throw new InvalidArgumentException('Answer format guardrail corpus not found. Run: php scripts/extension-benchmark/build-answer-format-guardrails-corpus.php');
            }
        }

        $corpus = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        self::validate($corpus);

        return $corpus;
    }

    /**
     * @param  array<string, mixed>  $corpus
     */
    public static function validate(array $corpus): void
    {
        if (($corpus['version'] ?? null) !== 1) {
            throw new InvalidArgumentException('answer-format-guardrails corpus version must be 1');
        }

        if (($corpus['persona_key'] ?? null) !== self::PERSONA_KEY) {
            throw new InvalidArgumentException('answer-format-guardrails corpus must use persona_key '.self::PERSONA_KEY);
        }

        if (! is_array($corpus['profile_persona'] ?? null) || $corpus['profile_persona'] === []) {
            throw new InvalidArgumentException('answer-format-guardrails corpus must include profile_persona');
        }

        if (! is_array($corpus['job_context'] ?? null) || $corpus['job_context'] === []) {
            throw new InvalidArgumentException('answer-format-guardrails corpus must include job_context');
        }

        if (! is_array($corpus['scenarios'] ?? null) || $corpus['scenarios'] === []) {
            throw new InvalidArgumentException('answer-format-guardrails corpus must include scenarios');
        }

        if (count($corpus['scenarios']) < self::MIN_SCENARIOS) {
            throw new InvalidArgumentException('answer-format-guardrails corpus must include at least '.self::MIN_SCENARIOS.' scenarios');
        }

        $ids = [];

        foreach ($corpus['scenarios'] as $index => $scenario) {
            if (! is_array($scenario)) {
                throw new InvalidArgumentException("Scenario at index {$index} must be an object");
            }

            foreach (['id', 'label', 'ref', 'field_type', 'answer_shape', 'brevity'] as $key) {
                if (! is_string($scenario[$key] ?? null) || $scenario[$key] === '') {
                    throw new InvalidArgumentException("Scenario missing or invalid {$key}");
                }
            }

            $id = $scenario['id'];

            if (isset($ids[$id])) {
                throw new InvalidArgumentException("Duplicate scenario id: {$id}");
            }

            $ids[$id] = true;

            if (! in_array($scenario['answer_shape'], self::ANSWER_SHAPES, true)) {
                throw new InvalidArgumentException("Scenario {$id} has unknown answer_shape: {$scenario['answer_shape']}");
            }

            if (! in_array($scenario['brevity'], self::BREVITY_LEVELS, true)) {
                throw new InvalidArgumentException("Scenario {$id} has unknown brevity: {$scenario['brevity']}");
            }

            if (isset($scenario['options']) && ! is_array($scenario['options'])) {
                throw new InvalidArgumentException("Scenario {$id} options must be an array");
            }

            if (in_array($scenario['answer_shape'], ['yes_no', 'select_option'], true)
                && (! is_array($scenario['options'] ?? null) || $scenario['options'] === [])) {
                throw new InvalidArgumentException("Scenario {$id} requires non-empty options for shape {$scenario['answer_shape']}");
            }

            foreach (['must_mention', 'must_not_mention'] as $listKey) {
                if (isset($scenario[$listKey]) && ! is_array($scenario[$listKey])) {
                    throw new InvalidArgumentException("Scenario {$id} {$listKey} must be an array");
                }
            }

            if (isset($scenario['must_match']) && is_string($scenario['must_match']) && $scenario['must_match'] !== '') {
                if (@preg_match($scenario['must_match'], '') === false) {
                    throw new InvalidArgumentException("Scenario {$id} has invalid must_match regex");
                }
            }

            foreach (['max_chars', 'max_words', 'min_words'] as $bound) {
                if (isset($scenario[$bound]) && (! is_int($scenario[$bound]) || $scenario[$bound] < 0)) {
                    throw new InvalidArgumentException("Scenario {$id} {$bound} must be a non-negative integer");
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $corpus
     */
    public static function profile(array $corpus): CvProfile
    {
        $persona = $corpus['profile_persona'];
        $settings = ApplicationSettings::merge($persona['application_settings'] ?? []);

        return new CvProfile([
            'full_name' => $persona['full_name'] ?? null,
            'headline' => $persona['headline'] ?? null,
            'email' => $persona['email'] ?? null,
            'phone' => $persona['phone'] ?? null,
            'location' => $persona['location'] ?? null,
            'city' => $persona['city'] ?? null,
            'country' => $persona['country'] ?? null,
            'linkedin_url' => $persona['linkedin_url'] ?? null,
            'website_url' => $persona['website_url'] ?? null,
            'summary' => $persona['summary'] ?? null,
            'skills' => $persona['skills'] ?? [],
            'experience' => $persona['experience'] ?? [],
            'education' => $persona['education'] ?? [],
            'structured_data' => $persona['structured_data'] ?? [],
            'application_settings' => $settings,
            'application_answers' => $persona['application_answers'] ?? [],
        ]);
    }

    /**
     * @param  array<string, mixed>  $corpus
     * @return array<string, mixed>
     */
    public static function settings(array $corpus): array
    {
        return ApplicationSettings::merge($corpus['profile_persona']['application_settings'] ?? []);
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    public static function questionFromScenario(array $scenario): array
    {
        $question = [
            'label' => $scenario['label'],
            'ref' => $scenario['ref'],
            'field_type' => $scenario['field_type'],
        ];

        if (isset($scenario['options']) && is_array($scenario['options'])) {
            $question['options'] = $scenario['options'];
        }

        if (isset($scenario['max_chars']) && is_int($scenario['max_chars'])) {
            $question['max_chars'] = $scenario['max_chars'];
        }

        return $question;
    }
}
