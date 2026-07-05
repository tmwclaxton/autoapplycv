<?php

namespace App\Support;

use App\Models\CvProfile;
use InvalidArgumentException;

class FormE2eScoringManifest
{
    public const MANIFEST_PATH = 'tests/fixtures/extension-e2e/form-e2e-scoring-scenarios.json';

    public const REPORT_PATH = 'tests/fixtures/extension-e2e/form-e2e-scoring-report.json';

    public const PERSONAS_PATH = 'scripts/extension-benchmark/answer-quality-personas.json';

    /**
     * @return array<string, mixed>
     */
    public static function load(): array
    {
        $path = base_path(self::MANIFEST_PATH);

        if (! is_file($path)) {
            throw new InvalidArgumentException(
                'Form E2E scoring manifest not found. Run: node scripts/form-corpus/build-form-e2e-scoring-scenarios.mjs',
            );
        }

        $manifest = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        self::validate($manifest);

        return $manifest;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function personas(): array
    {
        $path = base_path(self::PERSONAS_PATH);

        if (! is_file($path)) {
            throw new InvalidArgumentException('Missing answer-quality-personas.json');
        }

        $personas = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        if (! is_array($personas) || $personas === []) {
            throw new InvalidArgumentException('answer-quality-personas.json is empty');
        }

        return $personas;
    }

    /**
     * @param  array<string, mixed>  $manifest
     */
    public static function validate(array $manifest): void
    {
        if (($manifest['version'] ?? null) !== 1) {
            throw new InvalidArgumentException('form-e2e scoring manifest version must be 1');
        }

        if (! is_array($manifest['scenarios'] ?? null) || $manifest['scenarios'] === []) {
            throw new InvalidArgumentException('form-e2e scoring manifest must include scenarios');
        }

        $personas = self::personas();

        foreach ($manifest['scenarios'] as $scenario) {
            if (! is_array($scenario)) {
                throw new InvalidArgumentException('Each scoring scenario must be an object');
            }

            foreach (['id', 'profile_persona', 'questions'] as $key) {
                if (! array_key_exists($key, $scenario)) {
                    throw new InvalidArgumentException("Scoring scenario missing {$key}");
                }
            }

            if (! isset($personas[$scenario['profile_persona']])) {
                throw new InvalidArgumentException("Unknown profile_persona: {$scenario['profile_persona']}");
            }

            if (! is_array($scenario['questions']) || $scenario['questions'] === []) {
                throw new InvalidArgumentException("Scenario {$scenario['id']} must include questions");
            }
        }
    }

    /**
     * @param  array<string, mixed>  $scenario
     */
    public static function profileFromScenario(array $scenario): CvProfile
    {
        $personas = self::personas();
        $fixture = (string) ($scenario['profile_persona'] ?? '');

        if (! isset($personas[$fixture])) {
            throw new InvalidArgumentException("Unknown profile persona: {$fixture}");
        }

        $persona = $personas[$fixture];
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
    public static function settingsFromScenario(array $scenario): array
    {
        $personas = self::personas();
        $fixture = (string) ($scenario['profile_persona'] ?? '');
        $persona = $personas[$fixture] ?? [];

        return ApplicationSettings::merge($persona['application_settings'] ?? []);
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    public static function jobContextFromScenario(array $scenario): array
    {
        $title = is_string($scenario['page_title'] ?? null) ? trim($scenario['page_title']) : '';
        $company = null;

        if ($title !== '' && str_contains($title, ' at ')) {
            [$role, $org] = explode(' at ', $title, 2);
            $title = trim($role);
            $company = trim($org);
        }

        return [
            'title' => $title !== '' ? $title : 'Open Role',
            'company' => $company ?? 'Hiring Company',
            'location' => null,
            'job_description' => $title !== ''
                ? "Application form for {$title}."
                : 'Job application form with open-ended screening questions.',
        ];
    }
}
