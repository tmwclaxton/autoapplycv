<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Support\AnswerQualityCorpus;

class AnswerQualityAuditor
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AnswerQualityScorer $scorer,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function run(?int $limit = null, int $scoreBatchSize = 6): array
    {
        $corpus = AnswerQualityCorpus::load();
        $scenarios = $corpus['scenarios'];

        if ($limit !== null && $limit > 0) {
            $scenarios = array_slice($scenarios, 0, $limit);
        }

        $scenarioResults = [];
        $evaluations = [];

        foreach ($scenarios as $scenario) {
            $profile = AnswerQualityCorpus::profileFromScenario($corpus, $scenario);
            $settings = AnswerQualityCorpus::settingsFromScenario($corpus, $scenario);
            $job = $this->jobPayload($scenario);
            $questions = $scenario['questions'];

            $generation = $this->assistant->answerQuestions($profile, $job, $questions, $settings);

            if ($generation === null) {
                $scenarioResults[$scenario['id']] = [
                    'scenario_id' => $scenario['id'],
                    'error' => 'ApplicationAssistantService returned null',
                    'answers' => [],
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
                    'scenario_id' => $scenario['id'],
                    'question_ref' => $ref,
                    'question_label' => $question['label'],
                    'answer' => is_string($answer) ? $answer : null,
                    'profile' => $this->compactProfile($profile, $settings),
                    'job_context' => $scenario['job_context'],
                    'job_keywords' => $scenario['job_keywords'] ?? [],
                    'must_mention' => $scenario['must_mention'] ?? [],
                    'must_not_mention' => $scenario['must_not_mention'] ?? [],
                ];
            }

            $scenarioResults[$scenario['id']] = [
                'scenario_id' => $scenario['id'],
                'profile_fixture' => $scenario['profile_fixture'],
                'usage' => $generation['usage'] ?? [],
                'answers' => $generation['answers'],
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
                $scoreRow['scenario_id'] = $evaluation['scenario_id'];
                $scoreRow['question_ref'] = $evaluation['question_ref'];
                $scoreRow['question_label'] = $evaluation['question_label'];
                $scoreRow['answer'] = $evaluation['answer'];
                $scoredRows[] = $scoreRow;
            }
        }

        $scoresByScenario = collect($scoredRows)->groupBy('scenario_id');

        foreach ($scenarioResults as $scenarioId => &$scenarioResult) {
            $scenarioResult['scores'] = ($scoresByScenario->get($scenarioId) ?? collect())->values()->all();
            $scenarioResult['passed'] = collect($scenarioResult['scores'])->every(
                static fn (array $row): bool => ($row['passed'] ?? false) === true,
            ) && ($scenarioResult['error'] ?? null) === null;
        }
        unset($scenarioResult);

        $scenarioResults = array_values($scenarioResults);

        $summary = $this->scorer->summarizeReport($scoredRows);
        $worst = collect($scoredRows)
            ->sortBy('average')
            ->take(10)
            ->values()
            ->all();

        return [
            'generated_at' => now()->toIso8601String(),
            'model' => config('cv.extraction_model'),
            'scenario_count' => count($scenarios),
            'question_count' => count($scoredRows),
            'summary' => $summary,
            'worst_scenarios' => $worst,
            'scenarios' => $scenarioResults,
            'scores' => $scoredRows,
        ];
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    private function jobPayload(array $scenario): array
    {
        $context = $scenario['job_context'];

        return [
            'title' => $context['title'] ?? null,
            'company' => $context['company'] ?? null,
            'location' => $context['location'] ?? null,
            'job_description' => $context['description_snippet'] ?? null,
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
