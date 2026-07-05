<?php

namespace App\Support;

use App\Models\CvProfile;
use InvalidArgumentException;

class AnswerQualityCorpus
{
    public const CORPUS_PATH = 'scripts/extension-benchmark/answer-quality-corpus.json';

    public const REPORT_PATH = 'tests/fixtures/answer-quality/latest-report.json';

    /**
     * @return array<string, mixed>
     */
    public static function load(): array
    {
        $path = base_path(self::CORPUS_PATH);

        if (! is_file($path)) {
            AnswerQualityCorpusBuilder::writeJsonFile($path);

            if (! is_file($path)) {
                throw new InvalidArgumentException('Answer quality corpus not found. Run: php scripts/extension-benchmark/build-answer-quality-corpus.php');
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
            throw new InvalidArgumentException('answer-quality corpus version must be 1');
        }

        if (! is_array($corpus['scenarios'] ?? null) || $corpus['scenarios'] === []) {
            throw new InvalidArgumentException('answer-quality corpus must include scenarios');
        }

        if (count($corpus['scenarios']) < 100) {
            throw new InvalidArgumentException('answer-quality corpus must include at least 100 scenarios');
        }

        if (! is_array($corpus['profile_personas'] ?? null) || $corpus['profile_personas'] === []) {
            throw new InvalidArgumentException('answer-quality corpus must include profile_personas');
        }

        foreach ($corpus['scenarios'] as $scenario) {
            if (! is_array($scenario)) {
                throw new InvalidArgumentException('Each scenario must be an object');
            }

            foreach (['id', 'profile_fixture', 'job_context', 'questions'] as $key) {
                if (! array_key_exists($key, $scenario)) {
                    throw new InvalidArgumentException("Scenario missing {$key}");
                }
            }

            if (! is_string($scenario['profile_fixture']) || ! isset($corpus['profile_personas'][$scenario['profile_fixture']])) {
                throw new InvalidArgumentException("Unknown profile_fixture: {$scenario['profile_fixture']}");
            }

            if (! is_array($scenario['questions']) || $scenario['questions'] === []) {
                throw new InvalidArgumentException("Scenario {$scenario['id']} must include questions");
            }

            foreach ($scenario['questions'] as $question) {
                if (! is_array($question) || ! is_string($question['label'] ?? null) || ! is_string($question['ref'] ?? null)) {
                    throw new InvalidArgumentException("Scenario {$scenario['id']} has invalid question");
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $corpus
     */
    public static function profileFromScenario(array $corpus, array $scenario): CvProfile
    {
        $fixture = (string) ($scenario['profile_fixture'] ?? '');

        if (! isset($corpus['profile_personas'][$fixture])) {
            throw new InvalidArgumentException("Unknown profile fixture: {$fixture}");
        }

        $persona = $corpus['profile_personas'][$fixture];
        $settings = ApplicationSettings::merge($persona['application_settings'] ?? []);

        return new CvProfile([
            'full_name' => $persona['full_name'] ?? null,
            'headline' => $persona['headline'] ?? null,
            'email' => $persona['email'] ?? null,
            'phone' => $persona['phone'] ?? null,
            'location' => $persona['location'] ?? null,
            'city' => $persona['city'] ?? null,
            'country' => $persona['country'] ?? null,
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
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    public static function settingsFromScenario(array $corpus, array $scenario): array
    {
        $fixture = (string) ($scenario['profile_fixture'] ?? '');
        $persona = $corpus['profile_personas'][$fixture] ?? [];

        return ApplicationSettings::merge($persona['application_settings'] ?? []);
    }
}
