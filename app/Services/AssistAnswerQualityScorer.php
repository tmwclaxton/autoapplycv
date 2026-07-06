<?php

namespace App\Services;

use App\Support\AiPhraseDenylist;

class AssistAnswerQualityScorer
{
    public const DIMENSIONS = [
        'quality',
        'answered_question',
        'non_ai_phrasing',
        'tone_match',
        'grounding',
        'conciseness',
    ];

    public const PASS_AVERAGE = 4.0;

    public const MIN_ANSWERED = 3;

    public const MIN_GROUNDING = 3;

    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{
     *     id: string,
     *     user_question: string,
     *     response: string|null,
     *     response_style: string,
     *     profile: array<string, mixed>,
     *     job_context?: array<string, mixed>,
     *     tone?: array<string, mixed>,
     *     must_mention?: array<int, string>,
     *     must_not_mention?: array<int, string>,
     *     max_words?: int|null,
     *     max_chars?: int|null,
     * }>  $evaluations
     * @return array<int, array{
     *     id: string,
     *     scores: array<string, int>,
     *     average: float,
     *     score_100: int,
     *     passed: bool,
     *     mechanical: array<string, mixed>,
     *     notes: string,
     * }>
     */
    public function scoreBatch(array $evaluations): array
    {
        if ($evaluations === []) {
            return [];
        }

        $payload = json_encode([
            'items' => array_map(static function (array $row): array {
                return [
                    'id' => $row['id'],
                    'user_question' => $row['user_question'],
                    'response' => $row['response'],
                    'response_style' => $row['response_style'],
                    'profile' => $row['profile'],
                    'job_context' => $row['job_context'] ?? [],
                    'tone' => $row['tone'] ?? [],
                ];
            }, $evaluations),
        ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

        $judgePrompt = <<<'PROMPT'
You judge AutoCVApply sidebar Assist tab replies. The user asked a question; the assistant responded.

Return JSON:
{
  "results": [
    {
      "id": "evaluation-id",
      "scores": {
        "quality": 1-5,
        "answered_question": 1-5,
        "non_ai_phrasing": 1-5,
        "tone_match": 1-5,
        "grounding": 1-5,
        "conciseness": 1-5
      },
      "notes": "short rationale"
    }
  ]
}

Rubric (1=poor, 5=excellent):
- quality: overall usefulness and clarity for the user
- answered_question: relevance and completeness for what was asked
- non_ai_phrasing: sounds human, not generic AI copy. Heavily penalize telltale AI phrases such as:
PROMPT
            .AiPhraseDenylist::judgePromptHint().<<<'PROMPT'

- tone_match: matches response_style and tone metadata (formal employer form vs casual advice, UK vs US spelling/register, senior vs junior voice)
- grounding: uses only real profile facts; no invented employers, metrics, or tools
- conciseness: appropriate length; not padded or overly terse

response_style rules:
- form_answer: first-person paste-ready application copy; must not describe the candidate in third person or preface with "Based on your profile"
- advice: practical guidance in plain text; may address the user as "you"; should not read like a cover letter
- brief: one or two sentences only

Score null or empty responses honestly: low on all dimensions.
PROMPT;

        $response = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $judgePrompt,
            ],
            [
                'role' => 'user',
                'content' => "Score each item in this batch:\n{$payload}",
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0,
        ]);

        $parsedById = $this->parseJudgeResults($response);

        $results = [];

        foreach ($evaluations as $evaluation) {
            $judge = $parsedById[$evaluation['id']] ?? [
                'scores' => array_fill_keys(self::DIMENSIONS, 1),
                'notes' => 'NanoGPT returned no score.',
            ];

            $mechanical = $this->mechanicalChecks(
                (string) ($evaluation['response'] ?? ''),
                $evaluation,
            );

            $scores = $this->applyAiPhrasePenalties($judge['scores'], [
                'hard' => $mechanical['ai_phrase_hard'],
                'soft' => $mechanical['ai_phrase_soft'],
            ]);

            $notes = $judge['notes'];

            if (is_string($mechanical['ai_phrase_reason'] ?? null) && $mechanical['ai_phrase_reason'] !== '') {
                $notes = trim($notes.' '.$mechanical['ai_phrase_reason']);
            }

            if ($mechanical['failure_reasons'] !== []) {
                $notes = trim($notes.' Mechanical: '.implode('; ', $mechanical['failure_reasons']));
            }

            $average = $this->averageScores($scores);
            $passed = $this->passesThreshold($scores, $average, $mechanical);

            $results[] = [
                'id' => $evaluation['id'],
                'scores' => $scores,
                'average' => $average,
                'score_100' => $this->toScore100($average),
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

        if ((int) ($scores['answered_question'] ?? 0) < self::MIN_ANSWERED) {
            return false;
        }

        if ((int) ($scores['grounding'] ?? 0) < self::MIN_GROUNDING) {
            return false;
        }

        if ($mechanical !== null) {
            if (($mechanical['passed'] ?? false) !== true) {
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
        $nonAi = (int) ($scores['non_ai_phrasing'] ?? 1);

        if ($penalty['human_tone_cap'] !== null) {
            $nonAi = min($nonAi, $penalty['human_tone_cap']);
        }

        if ($penalty['human_tone_penalty'] > 0) {
            $nonAi = max(1, $nonAi - $penalty['human_tone_penalty']);
        }

        $scores['non_ai_phrasing'] = $nonAi;

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

    public function toScore100(float $average): int
    {
        return max(0, min(100, (int) round($average * 20)));
    }

    /**
     * @param  array<string, mixed>  $evaluation
     * @return array<string, mixed>
     */
    public function mechanicalChecks(string $response, array $evaluation): array
    {
        $normalizedAnswer = mb_strtolower(trim($response));
        $failureReasons = [];

        if ($normalizedAnswer === '') {
            $failureReasons[] = 'Empty response';
        }

        $mustMention = $evaluation['must_mention'] ?? [];
        $mustNotMention = $evaluation['must_not_mention'] ?? [];

        foreach ($mustMention as $term) {
            if ($term === '') {
                continue;
            }

            if ($this->termPresentInAnswer($normalizedAnswer, $term)) {
                continue;
            }

            $failureReasons[] = "Missing required mention: {$term}";
            break;
        }

        foreach ($mustNotMention as $term) {
            if ($term === '') {
                continue;
            }

            if ($this->termPresentInAnswer($normalizedAnswer, $term)) {
                $failureReasons[] = "Forbidden mention: {$term}";
                break;
            }
        }

        $aiViolations = AiPhraseDenylist::findViolations($response);
        $aiPenalty = AiPhraseDenylist::mechanicalPenalty($aiViolations);

        if ($aiPenalty['passed'] !== true) {
            $failureReasons[] = (string) $aiPenalty['reason'];
        }

        $responseStyle = (string) ($evaluation['response_style'] ?? 'form_answer');
        $tone = is_array($evaluation['tone'] ?? null) ? $evaluation['tone'] : [];

        if ($responseStyle === 'form_answer' && $normalizedAnswer !== '') {
            foreach (self::thirdPersonPrefacePatterns() as $pattern) {
                if (preg_match($pattern, $normalizedAnswer) === 1) {
                    $failureReasons[] = 'Third-person or meta preface in form answer';
                    break;
                }
            }
        }

        $locale = (string) ($tone['locale'] ?? '');

        if ($locale === 'en-GB' && $normalizedAnswer !== '') {
            foreach (self::usSpellingMarkers() as $marker) {
                if (preg_match('/(?<!\p{L})'.preg_quote($marker, '/').'(?!\p{L})/u', $normalizedAnswer) === 1) {
                    $failureReasons[] = "US spelling detected in UK tone: {$marker}";
                    break;
                }
            }
        }

        $maxWords = $evaluation['max_words'] ?? null;

        if (is_int($maxWords) && $maxWords > 0) {
            $wordCount = str_word_count($response);

            if ($wordCount > $maxWords) {
                $failureReasons[] = "Exceeded max words ({$wordCount} > {$maxWords})";
            }
        }

        $maxChars = $evaluation['max_chars'] ?? null;

        if (is_int($maxChars) && $maxChars > 0 && mb_strlen($response) > $maxChars) {
            $failureReasons[] = 'Exceeded max chars ('.mb_strlen($response)." > {$maxChars})";
        }

        $screening = (string) ($evaluation['screening_format'] ?? '');

        if ($screening === 'yes_no' && $normalizedAnswer !== '') {
            $hasYesNo = preg_match('/\b(yes|no)\b/u', $normalizedAnswer) === 1;

            if (! $hasYesNo) {
                $failureReasons[] = 'Screening answer missing yes/no';
            }
        }

        return [
            'passed' => $failureReasons === [],
            'failure_reasons' => $failureReasons,
            'ai_phrase_hard' => $aiViolations['hard'],
            'ai_phrase_soft' => $aiViolations['soft'],
            'ai_phrase_reason' => $aiPenalty['reason'],
            'ai_phrases_ok' => $aiPenalty['passed'],
        ];
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
        $score100Total = 0;

        foreach ($scoredRows as $row) {
            if (($row['passed'] ?? false) === true) {
                $passed++;
            }

            $score100Total += (int) ($row['score_100'] ?? 0);

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
            'average_score_100' => $total === 0 ? 0 : (int) round($score100Total / $total),
            'dimension_averages' => $dimensionAverages,
        ];
    }

    /**
     * @return array<int, string>
     */
    private static function usSpellingMarkers(): array
    {
        return [
            'organization',
            'organize',
            'organizing',
            'color',
            'optimize',
            'optimization',
            'center',
            'defense',
            'license',
        ];
    }

    /**
     * @return array<int, string>
     */
    private static function thirdPersonPrefacePatterns(): array
    {
        return [
            '/^based on (your )?(profile|cv|resume)/u',
            '/^according to (your )?(profile|cv|resume)/u',
            '/^the candidate/u',
            '/^[a-z]+ [a-z]+ is a /u',
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
     * @return array<string, array{scores: array<string, int>, notes: string}>
     */
    private function parseJudgeResults(?array $response): array
    {
        if (! is_array($response)) {
            return [];
        }

        $rows = $response['results'] ?? null;

        if (! is_array($rows) && is_array($response['scores'] ?? null)) {
            $rows = $response['scores'];
        }

        if (! is_array($rows) && is_array($response['items'] ?? null)) {
            $rows = $response['items'];
        }

        if (! is_array($rows) && is_array($response['evaluations'] ?? null)) {
            $rows = $response['evaluations'];
        }

        if (! is_array($rows)) {
            return [];
        }

        $parsedById = [];

        foreach ($rows as $row) {
            if (! is_array($row) || ! is_string($row['id'] ?? null)) {
                continue;
            }

            $scores = null;

            if (is_array($row['scores'] ?? null) && $this->hasDimensionScores($row['scores'])) {
                $scores = $this->normalizeScores($row['scores']);
            } elseif ($this->hasAlternateJudgeScores($row)) {
                $scores = $this->normalizeAlternateJudgeScores($row);
            } elseif (isset($row['score'])) {
                $single = $this->normalizeJudgeScalar($row['score']);
                $scores = array_fill_keys(self::DIMENSIONS, $single);
            } elseif (isset($row['rating'])) {
                $single = $this->normalizeJudgeScalar($row['rating']);
                $scores = array_fill_keys(self::DIMENSIONS, $single);
            } elseif (isset($row['overall'])) {
                $single = $this->normalizeJudgeScalar($row['overall']);
                $scores = array_fill_keys(self::DIMENSIONS, $single);
            }

            if ($scores === null) {
                continue;
            }

            $parsedById[$row['id']] = [
                'scores' => $scores,
                'notes' => trim((string) ($row['notes'] ?? $row['explanation'] ?? $row['feedback'] ?? '')),
            ];
        }

        return $parsedById;
    }

    /**
     * @param  array<string, mixed>  $scores
     */
    private function hasDimensionScores(array $scores): bool
    {
        foreach (self::DIMENSIONS as $dimension) {
            if (array_key_exists($dimension, $scores)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function hasAlternateJudgeScores(array $row): bool
    {
        foreach (['relevance', 'accuracy', 'completeness', 'clarity', 'adherence_to_style'] as $key) {
            if (array_key_exists($key, $row)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, int>
     */
    private function normalizeAlternateJudgeScores(array $row): array
    {
        $sources = [
            'quality' => ['quality', 'clarity'],
            'answered_question' => ['answered_question', 'relevance', 'completeness'],
            'non_ai_phrasing' => ['non_ai_phrasing', 'human_tone'],
            'tone_match' => ['tone_match', 'adherence_to_style'],
            'grounding' => ['grounding', 'accuracy'],
            'conciseness' => ['conciseness'],
        ];

        $scores = [];

        foreach (self::DIMENSIONS as $dimension) {
            $value = null;

            foreach ($sources[$dimension] as $key) {
                if (! array_key_exists($key, $row)) {
                    continue;
                }

                $value = $this->normalizeJudgeScalar($row[$key]);
                break;
            }

            $scores[$dimension] = $value ?? 1;
        }

        if (array_key_exists('overall', $row)) {
            $overall = $this->normalizeJudgeScalar($row['overall']);
            $scores['quality'] = (int) round(($scores['quality'] + $overall) / 2);
            $scores['answered_question'] = (int) round(($scores['answered_question'] + $overall) / 2);
        }

        return $scores;
    }

    private function normalizeJudgeScalar(mixed $value): int
    {
        if (! is_numeric($value)) {
            return 1;
        }

        $float = (float) $value;

        if ($float >= 0.0 && $float <= 1.0) {
            return max(1, min(5, (int) round($float * 5)));
        }

        return max(1, min(5, (int) round($float)));
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
