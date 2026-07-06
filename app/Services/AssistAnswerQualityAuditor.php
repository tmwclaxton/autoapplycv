<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Support\AssistAnswerQualityCorpus;

class AssistAnswerQualityAuditor
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AssistAnswerQualityScorer $scorer,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function run(?int $limit = null, int $scoreBatchSize = 6): array
    {
        $corpus = AssistAnswerQualityCorpus::load();
        $scenarios = $corpus['scenarios'];

        if ($limit !== null && $limit > 0) {
            $scenarios = array_slice($scenarios, 0, $limit);
        }

        $scenarioResults = [];
        $evaluations = [];

        foreach ($scenarios as $scenario) {
            $profile = AssistAnswerQualityCorpus::profileFromScenario($corpus, $scenario);
            $context = $this->buildContext($scenario);
            $conversation = $scenario['conversation'];

            $generation = $this->assistant->chat($profile, $conversation, $context);

            if ($generation === null) {
                $scenarioResults[$scenario['id']] = [
                    'scenario_id' => $scenario['id'],
                    'error' => 'ApplicationAssistantService returned null',
                    'response' => null,
                ];

                $evaluations[] = $this->buildEvaluation($corpus, $scenario, null);

                continue;
            }

            $response = $this->extractScoredResponse($generation, $scenario);

            $evaluations[] = $this->buildEvaluation($corpus, $scenario, $response);

            $scenarioResults[$scenario['id']] = [
                'scenario_id' => $scenario['id'],
                'profile_fixture' => $scenario['profile_fixture'],
                'category' => $scenario['category'] ?? null,
                'response_style' => $scenario['response_style'],
                'usage' => $generation['usage'] ?? [],
                'message' => $generation['message'] ?? null,
                'draft_answer' => $generation['draft_answer'] ?? null,
                'response' => $response,
            ];
        }

        $scoredRows = [];

        foreach (array_chunk($evaluations, max(1, $scoreBatchSize)) as $batch) {
            $batchScores = $this->scorer->scoreBatch($batch);

            foreach ($batchScores as $index => $scoreRow) {
                $evaluation = $batch[$index];
                $scoreRow['scenario_id'] = $evaluation['scenario_id'];
                $scoreRow['user_question'] = $evaluation['user_question'];
                $scoreRow['response'] = $evaluation['response'];
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

        $failurePatterns = $this->summarizeFailurePatterns($scoredRows);

        return [
            'generated_at' => now()->toIso8601String(),
            'model' => config('cv.extraction_model'),
            'scenario_count' => count($scenarios),
            'response_count' => count($scoredRows),
            'summary' => $summary,
            'failure_patterns' => $failurePatterns,
            'worst_scenarios' => $worst,
            'scenarios' => $scenarioResults,
            'scores' => $scoredRows,
        ];
    }

    /**
     * @param  array<string, mixed>  $baselineReport
     * @param  array<string, mixed>  $currentReport
     * @return array<string, mixed>
     */
    public function compareReports(array $baselineReport, array $currentReport): array
    {
        $baselineSummary = $baselineReport['summary'] ?? [];
        $currentSummary = $currentReport['summary'] ?? [];

        $dimensionDelta = [];

        foreach (AssistAnswerQualityScorer::DIMENSIONS as $dimension) {
            $before = (float) ($baselineSummary['dimension_averages'][$dimension] ?? 0);
            $after = (float) ($currentSummary['dimension_averages'][$dimension] ?? 0);
            $dimensionDelta[$dimension] = round($after - $before, 2);
        }

        return [
            'pass_rate_delta' => round(
                (float) ($currentSummary['pass_rate'] ?? 0) - (float) ($baselineSummary['pass_rate'] ?? 0),
                4,
            ),
            'average_score_100_delta' => (int) (($currentSummary['average_score_100'] ?? 0) - ($baselineSummary['average_score_100'] ?? 0)),
            'dimension_delta' => $dimensionDelta,
        ];
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    private function buildContext(array $scenario): array
    {
        $context = is_array($scenario['context'] ?? null) ? $scenario['context'] : [];

        if (isset($scenario['job_context']) && is_array($scenario['job_context'])) {
            $context['job'] = $scenario['job_context'];
        }

        return $context;
    }

    /**
     * @param  array<string, mixed>  $generation
     * @param  array<string, mixed>  $scenario
     */
    private function extractScoredResponse(array $generation, array $scenario): ?string
    {
        $draft = is_string($generation['draft_answer'] ?? null) ? trim($generation['draft_answer']) : '';
        $message = is_string($generation['message'] ?? null) ? trim($generation['message']) : '';

        if ($draft !== '') {
            return $draft;
        }

        if ($message !== '') {
            return $message;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $corpus
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    private function buildEvaluation(array $corpus, array $scenario, ?string $response): array
    {
        $profile = AssistAnswerQualityCorpus::profileFromScenario($corpus, $scenario);
        $settings = AssistAnswerQualityCorpus::settingsFromScenario($corpus, $scenario);

        return [
            'id' => $scenario['id'],
            'scenario_id' => $scenario['id'],
            'user_question' => $this->lastUserQuestion($scenario['conversation']),
            'response' => $response,
            'response_style' => (string) ($scenario['response_style'] ?? 'form_answer'),
            'profile' => $this->compactProfile($profile, $settings),
            'job_context' => $scenario['job_context'] ?? [],
            'tone' => $scenario['tone'] ?? [],
            'must_mention' => $scenario['must_mention'] ?? [],
            'must_not_mention' => $scenario['must_not_mention'] ?? [],
            'max_words' => $scenario['max_words'] ?? null,
            'max_chars' => $scenario['max_chars'] ?? null,
            'screening_format' => $scenario['screening_format'] ?? null,
        ];
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    private function lastUserQuestion(array $conversation): string
    {
        for ($index = count($conversation) - 1; $index >= 0; $index--) {
            if (($conversation[$index]['role'] ?? '') !== 'user') {
                continue;
            }

            return trim((string) ($conversation[$index]['content'] ?? ''));
        }

        return '';
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

    /**
     * @param  array<int, array<string, mixed>>  $scoredRows
     * @return array<int, array{pattern: string, count: int}>
     */
    private function summarizeFailurePatterns(array $scoredRows): array
    {
        $counts = [];

        foreach ($scoredRows as $row) {
            if (($row['passed'] ?? false) === true) {
                continue;
            }

            foreach ($row['mechanical']['failure_reasons'] ?? [] as $reason) {
                $key = (string) $reason;
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }

            foreach (AssistAnswerQualityScorer::DIMENSIONS as $dimension) {
                if ((int) ($row['scores'][$dimension] ?? 5) >= 3) {
                    continue;
                }

                $key = "Low {$dimension} score";
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
        }

        arsort($counts);

        $patterns = [];

        foreach (array_slice($counts, 0, 10, true) as $pattern => $count) {
            $patterns[] = [
                'pattern' => $pattern,
                'count' => $count,
            ];
        }

        return $patterns;
    }
}
