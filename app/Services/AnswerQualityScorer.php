<?php

namespace App\Services;

use App\Support\AiPhraseDenylist;

class AnswerQualityScorer
{
    public const DIMENSIONS = [
        'grounding',
        'specificity',
        'human_tone',
        'terminology',
        'language',
        'conciseness',
        'honesty',
    ];

    public const PASS_AVERAGE = 4.0;

    public const MIN_GROUNDING = 3;

    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{
     *     id: string,
     *     question_label: string,
     *     answer: string|null,
     *     profile: array<string, mixed>,
     *     job_context: array<string, mixed>,
     *     job_keywords?: array<int, string>,
     *     must_mention?: array<int, string>,
     *     must_not_mention?: array<int, string>,
     * }>  $evaluations
     * @return array<int, array{
     *     id: string,
     *     scores: array<string, int>,
     *     average: float,
     *     passed: bool,
     *     mechanical: array<string, bool>,
     *     notes: string,
     * }>
     */
    public function scoreBatch(array $evaluations): array
    {
        if ($evaluations === []) {
            return [];
        }

        $payload = json_encode([
            'evaluations' => array_map(static function (array $row): array {
                return [
                    'id' => $row['id'],
                    'question_label' => $row['question_label'],
                    'answer' => $row['answer'],
                    'profile' => $row['profile'],
                    'job_context' => $row['job_context'],
                    'job_keywords' => $row['job_keywords'] ?? [],
                ];
            }, $evaluations),
        ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

        $judgePrompt = <<<'PROMPT'
You judge job application answers written for a candidate using ONLY their profile.

Return JSON:
{
  "results": [
    {
      "id": "evaluation-id",
      "scores": {
        "grounding": 1-5,
        "specificity": 1-5,
        "human_tone": 1-5,
        "terminology": 1-5,
        "language": 1-5,
        "conciseness": 1-5,
        "honesty": 1-5
      },
      "notes": "short rationale"
    }
  ]
}

Rubric (1=poor, 5=excellent):
- grounding: uses real employers, roles, projects from profile; no invented employers, metrics, or tools
- specificity: concrete details, not vague corporate filler
- human_tone: sounds like a real applicant, not generic AI copy. Heavily penalize telltale AI phrases such as:
PROMPT
            .AiPhraseDenylist::judgePromptHint().<<<'PROMPT'

- terminology: uses job/recruiter-relevant terms when profile supports them
- language: answer language matches the question language
- conciseness: appropriate length for the question; not padded or overly terse
- honesty: admits gaps instead of fabricating experience

Score null answers honestly: low grounding/specificity, high honesty if it admits missing info.
PROMPT;

        $response = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $judgePrompt,
            ],
            [
                'role' => 'user',
                'content' => "Score these answers:\n{$payload}",
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0,
        ]);

        $parsedById = [];

        if (is_array($response) && is_array($response['results'] ?? null)) {
            foreach ($response['results'] as $row) {
                if (! is_array($row) || ! is_string($row['id'] ?? null)) {
                    continue;
                }

                $scores = $this->normalizeScores($row['scores'] ?? []);
                $parsedById[$row['id']] = [
                    'scores' => $scores,
                    'notes' => trim((string) ($row['notes'] ?? '')),
                ];
            }
        }

        $results = [];

        foreach ($evaluations as $evaluation) {
            $judge = $parsedById[$evaluation['id']] ?? [
                'scores' => array_fill_keys(self::DIMENSIONS, 1),
                'notes' => 'NanoGPT returned no score.',
            ];

            $mechanical = $this->mechanicalChecks(
                (string) ($evaluation['answer'] ?? ''),
                $evaluation['must_mention'] ?? [],
                $evaluation['must_not_mention'] ?? [],
            );

            $scores = $this->applyAiPhrasePenalties($judge['scores'], [
                'hard' => $mechanical['ai_phrase_hard'],
                'soft' => $mechanical['ai_phrase_soft'],
            ]);

            $notes = $judge['notes'];

            if (is_string($mechanical['ai_phrase_reason'] ?? null) && $mechanical['ai_phrase_reason'] !== '') {
                $notes = trim($notes.' '.$mechanical['ai_phrase_reason']);
            }

            $average = $this->averageScores($scores);
            $passed = $this->passesThreshold($scores, $average, $mechanical);

            $results[] = [
                'id' => $evaluation['id'],
                'scores' => $scores,
                'average' => $average,
                'passed' => $passed,
                'mechanical' => $mechanical,
                'notes' => $notes,
            ];
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $scores
     */
    public function passesThreshold(array $scores, ?float $average = null, ?array $mechanical = null): bool
    {
        $average ??= $this->averageScores($scores);

        if ($average < self::PASS_AVERAGE) {
            return false;
        }

        if ((int) ($scores['grounding'] ?? 0) < self::MIN_GROUNDING) {
            return false;
        }

        if ($mechanical !== null) {
            if (($mechanical['must_mention_ok'] ?? false) !== true) {
                return false;
            }

            if (($mechanical['must_not_mention_ok'] ?? false) !== true) {
                return false;
            }

            if (($mechanical['ai_phrases_ok'] ?? true) !== true) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, int>  $scores
     * @param  array{hard: array<int, string>, soft: array<int, string>}  $violations
     * @return array<string, int>
     */
    public function applyAiPhrasePenalties(array $scores, array $violations): array
    {
        $penalty = AiPhraseDenylist::mechanicalPenalty($violations);
        $humanTone = (int) ($scores['human_tone'] ?? 1);

        if ($penalty['human_tone_cap'] !== null) {
            $humanTone = min($humanTone, $penalty['human_tone_cap']);
        }

        if ($penalty['human_tone_penalty'] > 0) {
            $humanTone = max(1, $humanTone - $penalty['human_tone_penalty']);
        }

        $scores['human_tone'] = $humanTone;

        return $scores;
    }

    /**
     * @param  array<string, mixed>  $scores
     */
    public function averageScores(array $scores): float
    {
        $values = [];

        foreach (self::DIMENSIONS as $dimension) {
            if (! isset($scores[$dimension])) {
                continue;
            }

            $values[] = max(1, min(5, (int) $scores[$dimension]));
        }

        if ($values === []) {
            return 0.0;
        }

        return round(array_sum($values) / count($values), 2);
    }

    /**
     * @param  array<int, string>  $mustMention
     * @param  array<int, string>  $mustNotMention
     * @return array{
     *     must_mention_ok: bool,
     *     must_not_mention_ok: bool,
     *     ai_phrases_ok: bool,
     *     ai_phrase_hard: array<int, string>,
     *     ai_phrase_soft: array<int, string>,
     *     ai_phrase_reason: string|null,
     * }
     */
    public function mechanicalChecks(string $answer, array $mustMention, array $mustNotMention): array
    {
        $normalizedAnswer = mb_strtolower(trim($answer));

        $mustMentionOk = true;

        foreach ($mustMention as $term) {
            if ($term === '') {
                continue;
            }

            if ($this->termPresentInAnswer($normalizedAnswer, $term)) {
                continue;
            }

            $mustMentionOk = false;
            break;
        }

        $mustNotMentionOk = true;

        foreach ($mustNotMention as $term) {
            if ($term === '') {
                continue;
            }

            if ($this->termPresentInAnswer($normalizedAnswer, $term)) {
                $mustNotMentionOk = false;
                break;
            }
        }

        $aiViolations = AiPhraseDenylist::findViolations($answer);
        $aiPenalty = AiPhraseDenylist::mechanicalPenalty($aiViolations);

        return [
            'must_mention_ok' => $mustMentionOk,
            'must_not_mention_ok' => $mustNotMentionOk,
            'ai_phrases_ok' => $aiPenalty['passed'],
            'ai_phrase_hard' => $aiViolations['hard'],
            'ai_phrase_soft' => $aiViolations['soft'],
            'ai_phrase_reason' => $aiPenalty['reason'],
        ];
    }

    private function termPresentInAnswer(string $normalizedAnswer, string $term): bool
    {
        $normalizedTerm = mb_strtolower(trim($term));

        if ($normalizedTerm === '') {
            return false;
        }

        if (str_contains($normalizedAnswer, $normalizedTerm)) {
            return true;
        }

        $answerDigits = preg_replace('/\D+/', '', $normalizedAnswer) ?? '';
        $termDigits = preg_replace('/\D+/', '', $normalizedTerm) ?? '';

        return $termDigits !== '' && $answerDigits !== '' && str_contains($answerDigits, $termDigits);
    }

    /**
     * @param  array<int, array<string, mixed>>  $scoredRows
     * @return array<string, mixed>
     */
    public function summarizeReport(array $scoredRows): array
    {
        $dimensionTotals = array_fill_keys(self::DIMENSIONS, 0.0);
        $dimensionCounts = array_fill_keys(self::DIMENSIONS, 0);
        $passed = 0;

        foreach ($scoredRows as $row) {
            if (($row['passed'] ?? false) === true) {
                $passed++;
            }

            foreach (self::DIMENSIONS as $dimension) {
                if (! isset($row['scores'][$dimension])) {
                    continue;
                }

                $dimensionTotals[$dimension] += (int) $row['scores'][$dimension];
                $dimensionCounts[$dimension]++;
            }
        }

        $dimensionAverages = [];

        foreach (self::DIMENSIONS as $dimension) {
            $dimensionAverages[$dimension] = $dimensionCounts[$dimension] === 0
                ? 0.0
                : round($dimensionTotals[$dimension] / $dimensionCounts[$dimension], 2);
        }

        $total = count($scoredRows);

        return [
            'total' => $total,
            'passed' => $passed,
            'failed' => $total - $passed,
            'pass_rate' => $total === 0 ? 0.0 : round($passed / $total, 4),
            'dimension_averages' => $dimensionAverages,
        ];
    }

    /**
     * @param  array<string, mixed>  $rawScores
     * @return array<string, int>
     */
    private function normalizeScores(array $rawScores): array
    {
        $normalized = [];

        foreach (self::DIMENSIONS as $dimension) {
            $normalized[$dimension] = max(1, min(5, (int) ($rawScores[$dimension] ?? 1)));
        }

        return $normalized;
    }
}
