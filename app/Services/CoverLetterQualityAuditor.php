<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Support\AnswerQualityCorpus;

class CoverLetterQualityAuditor
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AnswerQualityScorer $scorer,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function run(?int $limit = null, int $scoreBatchSize = 4): array
    {
        $corpus = AnswerQualityCorpus::load();
        $scenarios = $this->coverLetterScenarios($corpus);

        if ($limit !== null && $limit > 0) {
            $scenarios = array_slice($scenarios, 0, $limit);
        }

        $scenarioResults = [];
        $evaluations = [];

        foreach ($scenarios as $scenario) {
            $profile = AnswerQualityCorpus::profileFromScenario($corpus, $scenario);
            $settings = AnswerQualityCorpus::settingsFromScenario($corpus, $scenario);
            $job = $this->jobPayload($scenario);

            $generation = $this->assistant->generateCoverLetter($profile, $job);

            if ($generation === null) {
                $scenarioResults[$scenario['id']] = [
                    'scenario_id' => $scenario['id'],
                    'profile_fixture' => $scenario['profile_fixture'],
                    'error' => 'ApplicationAssistantService returned null',
                    'cover_letter' => null,
                ];

                continue;
            }

            $coverLetter = $generation['content'];
            $evaluationId = $scenario['id'].'::cover-letter';

            $evaluations[] = [
                'id' => $evaluationId,
                'scenario_id' => $scenario['id'],
                'question_ref' => 'cover-letter',
                'question_label' => 'Cover letter',
                'answer' => $coverLetter,
                'profile' => $this->compactProfile($profile, $settings),
                'job_context' => $scenario['job_context'],
                'job_keywords' => $scenario['job_keywords'] ?? [],
                'must_mention' => $scenario['must_mention'] ?? [],
                'must_not_mention' => $scenario['must_not_mention'] ?? [],
            ];

            $scenarioResults[$scenario['id']] = [
                'scenario_id' => $scenario['id'],
                'profile_fixture' => $scenario['profile_fixture'],
                'job_context' => $scenario['job_context'],
                'usage' => $generation['usage'] ?? [],
                'cover_letter' => $coverLetter,
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

        foreach ($scenarioResults as $scenarioId => &$scenarioResult) {
            $score = collect($scoredRows)->firstWhere('scenario_id', $scenarioId);
            $scenarioResult['scores'] = $score !== null ? [$score] : [];
            $scenarioResult['passed'] = ($score['passed'] ?? false) === true && ($scenarioResult['error'] ?? null) === null;
            $scenarioResult['average'] = $score['average'] ?? null;
            $scenarioResult['human_tone'] = $score['scores']['human_tone'] ?? null;
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
            'summary' => $summary,
            'worst_scenarios' => $worst,
            'scenarios' => $scenarioResults,
            'scores' => $scoredRows,
        ];
    }

    /**
     * Pick one scenario per profile persona for cover letter evaluation.
     *
     * @param  array<string, mixed>  $corpus
     * @return array<int, array<string, mixed>>
     */
    private function coverLetterScenarios(array $corpus): array
    {
        $selected = [];
        $seenFixtures = [];

        foreach ($corpus['scenarios'] as $scenario) {
            $fixture = (string) ($scenario['profile_fixture'] ?? '');

            if ($fixture === '' || isset($seenFixtures[$fixture])) {
                continue;
            }

            $seenFixtures[$fixture] = true;
            $selected[] = $scenario;
        }

        return $selected;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    private function jobPayload(array $scenario): array
    {
        $context = $scenario['job_context'];
        $description = trim((string) ($context['description_snippet'] ?? ''));

        if (strlen($description) < 40) {
            $title = trim((string) ($context['title'] ?? 'This role'));
            $company = trim((string) ($context['company'] ?? 'The employer'));
            $description = "{$title} at {$company}. {$description}";
        }

        return [
            'title' => $context['title'] ?? null,
            'company' => $context['company'] ?? null,
            'location' => $context['location'] ?? null,
            'description' => $description,
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
