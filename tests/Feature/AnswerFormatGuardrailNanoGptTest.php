<?php

namespace Tests\Feature;

use App\Services\AnswerFormatGuardrailAuditor;
use App\Support\AnswerFormatGuardrailCorpus;
use App\Support\AnswerFormatGuardrailCorpusBuilder;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerFormatGuardrailNanoGptTest extends TestCase
{
    #[Test]
    #[Group('nanogpt-live')]
    public function nanogpt_format_guardrail_sample_passes_majority(): void
    {
        if (! filter_var(getenv('NANOGPT_LIVE_TESTS') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set NANOGPT_LIVE_TESTS=1 to run NanoGPT format guardrail audit (Sail/local only).');
        }

        if (blank(config('services.nanogpt.api_key'))) {
            $this->markTestSkipped('NANOGPT_API_KEY is required for live format guardrail audit.');
        }

        $limit = (int) (getenv('ANSWER_FORMAT_GUARDRAIL_LIMIT') ?: 8);
        $limit = max(1, min($limit, 40));

        $report = app(AnswerFormatGuardrailAuditor::class)->run(
            limit: $limit,
            withSemantic: true,
            withRubric: false,
            scoreBatchSize: 4,
            perShape: 1,
        );
        $summary = $report['summary'];

        $this->assertGreaterThan(0, $summary['total'] ?? 0);
        $this->assertArrayHasKey('thresholds', $report);
        $this->assertSame(3, $report['thresholds']['semantic_min_meaning'] ?? null);
        // Combined pass tolerates paraphrase; require majority on stratified sample.
        $this->assertGreaterThanOrEqual(0.5, $summary['pass_rate'] ?? 0.0, 'Combined format+semantic pass rate below 50% on sample');
    }

    #[Test]
    public function format_guardrail_corpus_loads_at_least_one_thousand_scenarios(): void
    {
        if (! is_file(base_path(AnswerFormatGuardrailCorpus::CORPUS_PATH))) {
            AnswerFormatGuardrailCorpusBuilder::writeJsonFile();
        }

        $corpus = AnswerFormatGuardrailCorpus::load();

        $this->assertGreaterThanOrEqual(1000, count($corpus['scenarios']));
    }
}
