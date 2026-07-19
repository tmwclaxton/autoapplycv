<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Support\ProfileIdentityFieldResolver;

/**
 * NanoGPT quality gate for Draft All answers before the extension fills the DOM.
 * Rejects wrong-type bleeds and invented tool/skill claims; may revise answers.
 */
class DraftAnswerVettingService
{
    public function __construct(private readonly NanoGptService $nanoGpt) {}

    public function enabled(): bool
    {
        return (bool) config('cv.ai_assist.draft_all_answer_vet_enabled', true);
    }

    /**
     * @param  array<string, mixed>  $job
     * @param  array<int, array{ref?: string|null, label: string, field_type?: string|null, options?: array<int, string>|null, answer: string|null}>  $candidates
     * @param  array<string, mixed>  $settings
     * @return array{verdicts: array<int, array{ref: string|null, label: string, verdict: string, answer: string|null, reason: string|null}>, usage: array<string, mixed>|null}
     */
    public function vetAnswers(CvProfile $profile, array $job, array $candidates, array $settings = []): array
    {
        $maxFields = max(1, (int) config('cv.ai_assist.draft_all_answer_vet_max_fields', 12));
        $slice = array_slice(array_values($candidates), 0, $maxFields);

        if ($slice === []) {
            return ['verdicts' => [], 'usage' => null];
        }

        $model = $this->nanoGpt->resolveModel('assist');
        $skills = array_values(array_filter(array_map(
            static fn ($skill): string => is_string($skill) ? trim($skill) : '',
            (array) ($profile->skills ?? []),
        )));
        $experienceSummary = [];

        foreach (array_slice((array) ($profile->experience ?? []), 0, 6) as $role) {
            if (! is_array($role)) {
                continue;
            }

            $experienceSummary[] = [
                'company' => $role['company'] ?? null,
                'title' => $role['title'] ?? null,
                'technologies' => array_slice(array_values(array_filter((array) ($role['technologies'] ?? []))), 0, 8),
            ];
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'You vet job-application draft answers for honesty and type correctness before they are filled into a form. '
                    .'Return JSON only: {"verdicts":[{"ref":"exact ref when provided","label":"exact label","verdict":"ok|reject|revise","answer":"string or null","reason":"short reason"}]}. '
                    .'Use verdict "ok" when the answer is the correct type and honestly grounded in the profile. '
                    .'Use "reject" (answer null) when the answer is wrong type (phone/email/URL in an essay), invents skill ratings or tool years not evidenced, answers Yes for a named tool/platform absent from the profile, or does not address the question. '
                    .'Use "revise" with a corrected answer when a small fix makes it honest and on-topic (for example change invented Okta Yes to No, or replace a phone bleed with null via reject instead). '
                    .'Named tools/platforms (Okta, MDM, Helpline, IAM, Jamf, Intune, macOS enterprise support, 1st-3rd line tech support): Yes only when clearly in profile skills/experience/technologies; otherwise reject or revise to No. '
                    .'Skill ratings out of 5/10: reject invented high scores for tools not on the CV. '
                    .'Never invent employers, tools, years, or contact details. '
                    .ProfileIdentityFieldResolver::identityPromptRules(),
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => [
                        'title' => $job['title'] ?? null,
                        'company' => $job['company'] ?? null,
                    ],
                    'profile' => [
                        'skills' => $skills,
                        'experience' => $experienceSummary,
                        'country' => $profile->country,
                        'application_settings' => [
                            'years_of_experience' => data_get($settings, 'years_of_experience')
                                ?? data_get($profile->application_settings, 'years_of_experience'),
                            'expected_salary_yearly' => data_get($settings, 'expected_salary_yearly')
                                ?? data_get($profile->application_settings, 'expected_salary_yearly'),
                            'legally_authorized' => data_get($profile->application_settings, 'legally_authorized'),
                            'visa_sponsorship' => data_get($profile->application_settings, 'visa_sponsorship'),
                        ],
                    ],
                    'candidates' => $slice,
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $model,
            'temperature' => 0.1,
            'max_tokens' => max(512, (int) config('cv.ai_assist.draft_all_answer_vet_max_tokens', 2048)),
        ]);

        $usage = is_array($payload['_usage'] ?? null) ? $payload['_usage'] : null;
        $rows = is_array($payload['verdicts'] ?? null) ? $payload['verdicts'] : [];
        $verdicts = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $verdict = mb_strtolower(trim((string) ($row['verdict'] ?? '')));

            if (! in_array($verdict, ['ok', 'reject', 'revise'], true)) {
                continue;
            }

            $answer = isset($row['answer']) && is_string($row['answer']) ? trim($row['answer']) : null;

            if ($verdict === 'reject') {
                $answer = null;
            }

            if ($verdict === 'revise' && ($answer === null || $answer === '')) {
                $verdict = 'reject';
                $answer = null;
            }

            $verdicts[] = [
                'ref' => isset($row['ref']) && is_string($row['ref']) && $row['ref'] !== '' ? $row['ref'] : null,
                'label' => is_string($row['label'] ?? null) ? $row['label'] : '',
                'verdict' => $verdict,
                'answer' => $answer !== '' ? $answer : null,
                'reason' => isset($row['reason']) && is_string($row['reason']) ? $row['reason'] : null,
            ];
        }

        return ['verdicts' => $verdicts, 'usage' => $usage];
    }
}
