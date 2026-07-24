<?php

namespace App\Services;

/**
 * Second-stage live judge for format-guardrail audits.
 *
 * Tolerates paraphrase / equivalent forms (e.g. "No" vs "no", "65000" vs "£65,000").
 * Does not require exact string match to ideal_answer.
 */
class AnswerFormatSemanticJudge
{
    public const MIN_MEANING = 3;

    public const MIN_HONESTY = 3;

    public const DIMENSIONS = [
        'meaning',
        'honesty',
    ];

    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{
     *     id: string,
     *     question_label: string,
     *     answer: string|null,
     *     answer_shape: string,
     *     brevity: string,
     *     ideal_answer?: string|null,
     *     ideal_answer_notes?: string|null,
     *     options?: array<int, string>,
     *     profile: array<string, mixed>,
     *     job_context: array<string, mixed>,
     * }>  $evaluations
     * @return array<int, array{
     *     id: string,
     *     scores: array{meaning: int, honesty: int},
     *     average: float,
     *     passed: bool,
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
                    'answer_shape' => $row['answer_shape'],
                    'brevity' => $row['brevity'],
                    'ideal_answer' => $row['ideal_answer'] ?? null,
                    'ideal_answer_notes' => $row['ideal_answer_notes'] ?? null,
                    'options' => $row['options'] ?? [],
                    'profile' => $row['profile'],
                    'job_context' => $row['job_context'],
                ];
            }, $evaluations),
        ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

        $judgePrompt = <<<'PROMPT'
You judge job-application form answers for meaning quality. Mechanical format was already checked separately.

Return JSON:
{
  "results": [
    {
      "id": "evaluation-id",
      "scores": {
        "meaning": 1-5,
        "honesty": 1-5
      },
      "notes": "short rationale"
    }
  ]
}

Rules:
- Do NOT require exact string match to ideal_answer. Accept equivalent forms and paraphrase.
  Examples that should score well when profile supports them:
  - yes/no: "No", "no", and exact option "No" are equivalent
  - currency: "65000", "£65,000", "65k" are equivalent for the same amount
  - notice: "1 month", "one month", "4 weeks" are equivalent when profile says 1 month
  - URL/email/phone: minor formatting differences OK if same destination/contact
- meaning: does the answer convey the right intent for this question given profile + ideal_answer/notes?
  5 = clearly correct, 3 = acceptable, 1 = wrong/stupid/off-topic
- honesty: grounded in profile; no invented employers, metrics, tools, or credentials
  5 = honest, 1 = fabricated or contradicted by profile
- If ideal_answer is present, treat it as a reference meaning, not a required verbatim string.
- If answer is null/empty, score meaning 1 and honesty 3.
- Fail (low meaning) when a yes/no is the opposite of what the profile implies, or when substance answers are generic fluff with no grounding.
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
                'notes' => 'NanoGPT returned no semantic score.',
            ];

            $scores = $judge['scores'];
            $average = round(array_sum($scores) / max(1, count($scores)), 2);
            $passed = $this->passesThreshold($scores);

            $results[] = [
                'id' => $evaluation['id'],
                'scores' => $scores,
                'average' => $average,
                'passed' => $passed,
                'notes' => $judge['notes'],
            ];
        }

        return $results;
    }

    /**
     * @param  array{meaning?: int, honesty?: int}  $scores
     */
    public function passesThreshold(array $scores): bool
    {
        return (int) ($scores['meaning'] ?? 0) >= self::MIN_MEANING
            && (int) ($scores['honesty'] ?? 0) >= self::MIN_HONESTY;
    }

    /**
     * Combine mechanical format + semantic judge.
     */
    public static function combinePassed(bool $formatPassed, ?bool $semanticPassed): bool
    {
        if (! $formatPassed) {
            return false;
        }

        if ($semanticPassed === null) {
            return true;
        }

        return $semanticPassed === true;
    }

    /**
     * @param  array<string, mixed>  $rawScores
     * @return array{meaning: int, honesty: int}
     */
    private function normalizeScores(array $rawScores): array
    {
        return [
            'meaning' => max(1, min(5, (int) ($rawScores['meaning'] ?? 1))),
            'honesty' => max(1, min(5, (int) ($rawScores['honesty'] ?? 1))),
        ];
    }
}
