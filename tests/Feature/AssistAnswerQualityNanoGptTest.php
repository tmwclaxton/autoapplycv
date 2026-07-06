<?php

namespace Tests\Feature;

use App\Services\AssistAnswerQualityAuditor;
use App\Services\AssistAnswerQualityScorer;
use App\Support\AssistAnswerQualityCorpus;
use App\Support\AssistAnswerQualityCorpusBuilder;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AssistAnswerQualityNanoGptTest extends TestCase
{
    #[Test]
    #[Group('nanogpt-live')]
    public function nanogpt_scores_assist_answer_quality_corpus(): void
    {
        if (! filter_var(getenv('NANOGPT_LIVE_TESTS') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set NANOGPT_LIVE_TESTS=1 to run NanoGPT Assist answer quality scoring (Sail/local only).');
        }

        if (blank(config('services.nanogpt.api_key'))) {
            $this->markTestSkipped('NANOGPT_API_KEY is required for live Assist answer quality scoring.');
        }

        $limit = (int) (getenv('ASSIST_ANSWER_QUALITY_LIMIT') ?: 5);
        $limit = max(1, min($limit, 20));

        $report = app(AssistAnswerQualityAuditor::class)->run($limit, scoreBatchSize: 3);
        $summary = $report['summary'];

        $this->assertGreaterThan(0, $report['scenario_count'] ?? 0);
        $this->assertGreaterThan(0, $report['response_count'] ?? 0);
        $this->assertGreaterThanOrEqual(0.5, $summary['pass_rate'] ?? 0.0, 'Pass rate below 50% on sample corpus');
    }

    #[Test]
    public function assist_answer_quality_scorer_mechanical_checks_work(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $mechanical = $scorer->mechanicalChecks(
            'I have shipped Laravel APIs at Riverbank Systems for billing workflows.',
            [
                'response_style' => 'form_answer',
                'tone' => ['locale' => 'en-GB'],
                'must_mention' => ['Riverbank Systems'],
                'must_not_mention' => ['based on your profile'],
            ],
        );

        $this->assertTrue($mechanical['passed']);
        $this->assertTrue($scorer->passesThreshold([
            'quality' => 4,
            'answered_question' => 4,
            'non_ai_phrasing' => 4,
            'tone_match' => 4,
            'grounding' => 4,
            'conciseness' => 4,
        ], mechanical: $mechanical));
    }

    #[Test]
    public function assist_answer_quality_corpus_loads_at_least_forty_scenarios(): void
    {
        if (! is_file(base_path(AssistAnswerQualityCorpus::CORPUS_PATH))) {
            AssistAnswerQualityCorpusBuilder::writeJsonFile();
        }

        $corpus = AssistAnswerQualityCorpus::load();

        $this->assertGreaterThanOrEqual(40, count($corpus['scenarios']));
    }
}
