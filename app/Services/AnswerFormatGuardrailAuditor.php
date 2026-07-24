<?php

namespace App\Services;

use App\Support\AnswerFormatGuardrailCorpus;

class AnswerFormatGuardrailAuditor
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AnswerFormatValidator $validator,
        private readonly AnswerFormatSemanticJudge $semanticJudge,
        private readonly AnswerQualityScorer $scorer,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function run(
        ?int $limit = null,
        bool $withSemantic = true,
        bool $withRubric = false,
        int $scoreBatchSize = 6,
        ?string $shapeFilter = null,
        ?int $perShape = null,
    ): array {
        $corpus = AnswerFormatGuardrailCorpus::load();
        $scenarios = $corpus['scenarios'];

        if (is_string($shapeFilter) && $shapeFilter !== '') {
            $scenarios = array_values(array_filter(
                $scenarios,
                static fn (array $row): bool => ($row['answer_shape'] ?? '') === $shapeFilter,
            ));
        }

        if ($perShape !== null && $perShape > 0) {
            $scenarios = $this->samplePerShape($scenarios, $perShape);
        }

        if ($limit !== null && $limit > 0) {
            $scenarios = array_slice($scenarios, 0, $limit);
        }

        $profile = AnswerFormatGuardrailCorpus::profile($corpus);
        $settings = AnswerFormatGuardrailCorpus::settings($corpus);
        $job = [
            'title' => $corpus['job_context']['title'] ?? null,
            'company' => $corpus['job_context']['company'] ?? null,
            'location' => $corpus['job_context']['location'] ?? null,
            'job_description' => $corpus['job_context']['description_snippet'] ?? null,
        ];

        $compactProfile = [
            'full_name' => $profile->full_name,
            'headline' => $profile->headline,
            'summary' => $profile->summary,
            'email' => $profile->email,
            'phone' => $profile->phone,
            'linkedin_url' => $profile->linkedin_url,
            'website_url' => $profile->website_url,
            'skills' => $profile->skills,
            'experience' => $profile->experience,
            'education' => $profile->education,
            'structured_data' => $profile->structured_data,
            'application_settings' => $settings,
            'application_answers' => $profile->application_answers,
        ];

        $results = [];
        $semanticEvaluations = [];
        $rubricEvaluations = [];

        foreach (array_chunk($scenarios, 8) as $chunk) {
            $questions = array_map(
                static fn (array $scenario): array => AnswerFormatGuardrailCorpus::questionFromScenario($scenario),
                $chunk,
            );

            $generation = $this->assistant->answerQuestions($profile, $job, $questions, $settings);

            if ($generation === null) {
                foreach ($chunk as $scenario) {
                    $results[] = [
                        'id' => $scenario['id'],
                        'answer_shape' => $scenario['answer_shape'],
                        'brevity' => $scenario['brevity'],
                        'label' => $scenario['label'],
                        'answer' => null,
                        'format_passed' => false,
                        'semantic_passed' => null,
                        'failures' => ['generation_null'],
                        'checks' => [],
                        'passed' => false,
                    ];
                }

                continue;
            }

            $answersByRef = collect($generation['answers'])->keyBy('ref');

            foreach ($chunk as $scenario) {
                $ref = (string) $scenario['ref'];
                $answer = $answersByRef->get($ref)['answer'] ?? null;
                $answerText = is_string($answer) ? $answer : null;
                $validation = $this->validator->validate($answerText, $scenario);

                $row = [
                    'id' => $scenario['id'],
                    'answer_shape' => $scenario['answer_shape'],
                    'brevity' => $scenario['brevity'],
                    'label' => $scenario['label'],
                    'answer' => $answerText,
                    'format_passed' => $validation['passed'],
                    'semantic_passed' => null,
                    'failures' => $validation['failures'],
                    'checks' => $validation['checks'],
                    'word_count' => $validation['word_count'],
                    'char_count' => $validation['char_count'],
                    'ideal_answer' => $scenario['ideal_answer'] ?? null,
                    'ideal_answer_notes' => $scenario['ideal_answer_notes'] ?? null,
                ];

                $results[] = $row;

                if ($withSemantic) {
                    $semanticEvaluations[] = [
                        'id' => $scenario['id'],
                        'question_label' => $scenario['label'],
                        'answer' => $answerText,
                        'answer_shape' => $scenario['answer_shape'],
                        'brevity' => $scenario['brevity'],
                        'ideal_answer' => $scenario['ideal_answer'] ?? null,
                        'ideal_answer_notes' => $scenario['ideal_answer_notes'] ?? null,
                        'options' => is_array($scenario['options'] ?? null) ? $scenario['options'] : [],
                        'profile' => $compactProfile,
                        'job_context' => $corpus['job_context'],
                    ];
                }

                if ($withRubric) {
                    $rubricEvaluations[] = [
                        'id' => $scenario['id'],
                        'question_label' => $scenario['label'],
                        'answer' => $answerText,
                        'profile' => $compactProfile,
                        'job_context' => $corpus['job_context'],
                        'must_mention' => $scenario['must_mention'] ?? [],
                        'must_not_mention' => $scenario['must_not_mention'] ?? [],
                    ];
                }
            }
        }

        $semanticById = [];

        if ($withSemantic && $semanticEvaluations !== []) {
            foreach (array_chunk($semanticEvaluations, max(1, $scoreBatchSize)) as $batch) {
                foreach ($this->semanticJudge->scoreBatch($batch) as $scoreRow) {
                    $semanticById[$scoreRow['id']] = $scoreRow;
                }
            }
        }

        $rubricById = [];

        if ($withRubric && $rubricEvaluations !== []) {
            foreach (array_chunk($rubricEvaluations, max(1, $scoreBatchSize)) as $batch) {
                foreach ($this->scorer->scoreBatch($batch) as $scoreRow) {
                    $rubricById[$scoreRow['id']] = $scoreRow;
                }
            }
        }

        foreach ($results as &$result) {
            $semantic = $semanticById[$result['id']] ?? null;
            $rubric = $rubricById[$result['id']] ?? null;

            if ($semantic !== null) {
                $result['semantic'] = $semantic;
                $result['semantic_passed'] = ($semantic['passed'] ?? false) === true;
                if (! $result['semantic_passed']) {
                    $result['failures'] = array_values(array_unique(array_merge(
                        $result['failures'] ?? [],
                        ['semantic_meaning'],
                    )));
                }
            }

            if ($rubric !== null) {
                $result['rubric'] = $rubric;
            }

            $formatOk = ($result['format_passed'] ?? false) === true;
            $semanticOk = $withSemantic ? (($result['semantic_passed'] ?? false) === true) : null;
            $combined = AnswerFormatSemanticJudge::combinePassed($formatOk, $semanticOk);

            if ($withRubric) {
                $combined = $combined && (($rubric['passed'] ?? false) === true);
                if (($rubric['passed'] ?? false) !== true) {
                    $result['failures'] = array_values(array_unique(array_merge(
                        $result['failures'] ?? [],
                        ['rubric'],
                    )));
                }
            }

            $result['passed'] = $combined;
        }
        unset($result);

        $byShape = [];
        $formatPassed = 0;
        $semanticPassed = 0;
        $semanticScored = 0;

        foreach ($results as $result) {
            $shape = (string) $result['answer_shape'];
            $byShape[$shape] ??= [
                'total' => 0,
                'passed' => 0,
                'failed' => 0,
                'format_passed' => 0,
                'semantic_passed' => 0,
            ];
            $byShape[$shape]['total']++;
            if (($result['format_passed'] ?? false) === true) {
                $byShape[$shape]['format_passed']++;
                $formatPassed++;
            }
            if (array_key_exists('semantic_passed', $result) && $result['semantic_passed'] !== null) {
                $semanticScored++;
                if ($result['semantic_passed'] === true) {
                    $byShape[$shape]['semantic_passed']++;
                    $semanticPassed++;
                }
            }
            if ($result['passed']) {
                $byShape[$shape]['passed']++;
            } else {
                $byShape[$shape]['failed']++;
            }
        }

        ksort($byShape);

        $passed = count(array_filter($results, static fn (array $row): bool => ($row['passed'] ?? false) === true));
        $total = count($results);

        $failures = array_values(array_filter(
            $results,
            static fn (array $row): bool => ($row['passed'] ?? false) !== true,
        ));

        return [
            'generated_at' => now()->toIso8601String(),
            'model' => config('cv.extraction_model'),
            'persona_key' => $corpus['persona_key'],
            'question_count' => $total,
            'with_semantic' => $withSemantic,
            'with_rubric' => $withRubric,
            'thresholds' => [
                'semantic_min_meaning' => AnswerFormatSemanticJudge::MIN_MEANING,
                'semantic_min_honesty' => AnswerFormatSemanticJudge::MIN_HONESTY,
                'combine' => 'fail if mechanical format fails OR semantic judge fails (when enabled); exact ideal_answer match is never required',
            ],
            'summary' => [
                'total' => $total,
                'passed' => $passed,
                'failed' => $total - $passed,
                'pass_rate' => $total > 0 ? round($passed / $total, 4) : 0.0,
                'format_pass_rate' => $total > 0 ? round($formatPassed / $total, 4) : 0.0,
                'semantic_pass_rate' => $semanticScored > 0 ? round($semanticPassed / $semanticScored, 4) : null,
                'by_shape' => $byShape,
            ],
            'failures' => array_slice($failures, 0, 50),
            'results' => $results,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $scenarios
     * @return list<array<string, mixed>>
     */
    private function samplePerShape(array $scenarios, int $perShape): array
    {
        $grouped = [];

        foreach ($scenarios as $scenario) {
            $shape = (string) ($scenario['answer_shape'] ?? 'unknown');
            $grouped[$shape][] = $scenario;
        }

        $sample = [];

        foreach ($grouped as $rows) {
            $sample = array_merge($sample, array_slice($rows, 0, $perShape));
        }

        return array_values($sample);
    }
}
