<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Support\FormE2eScoringManifest;

class FormE2eScoringAuditor
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AnswerQualityScorer $scorer,
    ) {}

    /**
     * @return array<string, mixed>
     */
    /**
     * @param  array<string, mixed>|null  $manifestOverride
     * @return array<string, mixed>
     */
    public function run(?int $limit = null, int $scoreBatchSize = 6, ?array $manifestOverride = null): array
    {
        $manifest = $manifestOverride ?? FormE2eScoringManifest::load();
        $scenarios = $manifest['scenarios'];

        if ($limit !== null && $limit > 0) {
            $scenarios = array_slice($scenarios, 0, $limit);
        }

        $scenarioResults = [];
        $evaluations = [];

        foreach ($scenarios as $scenario) {
            $profile = FormE2eScoringManifest::profileFromScenario($scenario);
            $settings = FormE2eScoringManifest::settingsFromScenario($scenario);
            $job = FormE2eScoringManifest::jobContextFromScenario($scenario);
            $questions = $scenario['questions'];

            $generation = $this->assistant->answerQuestions($profile, $job, $questions, $settings);

            if ($generation === null) {
                $scenarioResults[] = [
                    'fixture_id' => $scenario['id'],
                    'profile_persona' => $scenario['profile_persona'],
                    'platform' => $scenario['platform'] ?? null,
                    'error' => 'ApplicationAssistantService returned null',
                    'answers' => [],
                    'scores' => [],
                ];

                continue;
            }

            $answersByRef = collect($generation['answers'])->keyBy('ref');

            foreach ($questions as $question) {
                $ref = (string) ($question['ref'] ?? '');
                $answer = $answersByRef->get($ref)['answer'] ?? null;
                $evaluationId = $scenario['id'].'::'.$ref;

                $evaluations[] = [
                    'id' => $evaluationId,
                    'fixture_id' => $scenario['id'],
                    'profile_persona' => $scenario['profile_persona'],
                    'question_ref' => $ref,
                    'question_label' => $question['label'],
                    'answer' => is_string($answer) ? $answer : null,
                    'profile' => $this->compactProfile($profile, $settings),
                    'job_context' => $job,
                    'job_keywords' => [],
                    'must_mention' => [],
                    'must_not_mention' => ['fintech', 'proven track record', 'invented metrics'],
                ];
            }

            $scenarioResults[] = [
                'fixture_id' => $scenario['id'],
                'profile_persona' => $scenario['profile_persona'],
                'platform' => $scenario['platform'] ?? null,
                'usage' => $generation['usage'] ?? [],
                'answers' => $generation['answers'],
                'scores' => [],
            ];
        }

        $scoredRows = [];

        foreach (array_chunk($evaluations, max(1, $scoreBatchSize)) as $batch) {
            $scorePayload = array_map(static function (array $row): array {
                return [
                    'id' => $row['id'],
                    'question_label' => $row['question_label'],
                    'answer' => $row['answer'],
                    'profile' => $row['profile'],
                    'job_context' => $row['job_context'],
                    'job_keywords' => $row['job_keywords'],
                    'must_mention' => $row['must_mention'],
                    'must_not_mention' => $row['must_not_mention'],
                ];
            }, $batch);

            $batchScores = $this->scorer->scoreBatch($scorePayload);

            foreach ($batchScores as $index => $scoreRow) {
                $evaluation = $batch[$index];
                $scoreRow['fixture_id'] = $evaluation['fixture_id'];
                $scoreRow['profile_persona'] = $evaluation['profile_persona'];
                $scoreRow['question_ref'] = $evaluation['question_ref'];
                $scoreRow['question_label'] = $evaluation['question_label'];
                $scoreRow['answer'] = $evaluation['answer'];
                $scoredRows[] = $scoreRow;
            }
        }

        $scoresByFixture = collect($scoredRows)->groupBy('fixture_id');

        foreach ($scenarioResults as &$scenarioResult) {
            $scenarioResult['scores'] = ($scoresByFixture->get($scenarioResult['fixture_id']) ?? collect())->values()->all();
            $scenarioResult['passed'] = collect($scenarioResult['scores'])->every(
                static fn (array $row): bool => ($row['passed'] ?? false) === true,
            ) && ($scenarioResult['error'] ?? null) === null;
        }
        unset($scenarioResult);

        $summary = $this->scorer->summarizeReport($scoredRows);
        $worst = collect($scoredRows)
            ->sortBy('average')
            ->take(15)
            ->values()
            ->all();

        return [
            'generated_at' => now()->toIso8601String(),
            'model' => config('cv.extraction_model'),
            'fixture_count' => count($scenarios),
            'question_count' => count($scoredRows),
            'summary' => $summary,
            'worst_answers' => $worst,
            'fixtures' => $scenarioResults,
            'scores' => $scoredRows,
        ];
    }

    /**
     * @param  array<string, string>  $settings
     * @return array<string, mixed>
     */
    private function compactProfile(CvProfile $profile, array $settings): array
    {
        return [
            'full_name' => $profile->full_name,
            'headline' => $profile->headline,
            'summary' => $profile->summary,
            'skills' => $profile->skills,
            'experience' => $profile->experience,
            'education' => $profile->education,
            'structured_data' => $profile->structured_data,
            'application_settings' => $settings,
            'application_answers' => $profile->application_answers,
        ];
    }
}
