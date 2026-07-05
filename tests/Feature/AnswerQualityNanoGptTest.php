<?php

namespace Tests\Feature;

use App\Services\AnswerQualityAuditor;
use App\Services\AnswerQualityScorer;
use App\Support\AnswerQualityCorpus;
use App\Support\AnswerQualityCorpusBuilder;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerQualityNanoGptTest extends TestCase
{
    #[Test]
    #[Group('nanogpt-live')]
    public function nanogpt_scores_synthetic_answer_quality_corpus(): void
    {
        if (! filter_var(getenv('NANOGPT_LIVE_TESTS') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set NANOGPT_LIVE_TESTS=1 to run NanoGPT answer quality scoring (Sail/local only).');
        }

        if (blank(config('services.nanogpt.api_key'))) {
            $this->markTestSkipped('NANOGPT_API_KEY is required for live answer quality scoring.');
        }

        $limit = (int) (getenv('ANSWER_QUALITY_LIMIT') ?: 5);
        $limit = max(1, min($limit, 20));

        $report = app(AnswerQualityAuditor::class)->run($limit, scoreBatchSize: 4);
        $summary = $report['summary'];

        $this->assertGreaterThan(0, $report['scenario_count'] ?? 0);
        $this->assertGreaterThan(0, $report['question_count'] ?? 0);
        $this->assertGreaterThanOrEqual(0.6, $summary['pass_rate'] ?? 0.0, 'Pass rate below 60% on sample corpus');
    }

    #[Test]
    public function answer_quality_scorer_mechanical_checks_work(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $mechanical = $scorer->mechanicalChecks(
            'I led migration work at Riverbank Systems on Laravel APIs.',
            ['Riverbank Systems'],
            ['fintech'],
        );

        $this->assertTrue($mechanical['must_mention_ok']);
        $this->assertTrue($mechanical['must_not_mention_ok']);
        $this->assertTrue($scorer->passesThreshold([
            'grounding' => 4,
            'specificity' => 4,
            'human_tone' => 4,
            'terminology' => 4,
            'language' => 5,
            'conciseness' => 4,
            'honesty' => 5,
        ], mechanical: $mechanical));
    }

    #[Test]
    public function answer_quality_corpus_loads_at_least_one_hundred_scenarios(): void
    {
        if (! is_file(base_path(AnswerQualityCorpus::CORPUS_PATH))) {
            AnswerQualityCorpusBuilder::writeJsonFile();
        }

        $corpus = AnswerQualityCorpus::load();

        $this->assertGreaterThanOrEqual(100, count($corpus['scenarios']));
        $this->assertGreaterThanOrEqual(8, count($corpus['profile_personas']));
    }
}
