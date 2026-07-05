<?php

namespace Tests\Feature;

use App\Services\FormE2eScoringAuditor;
use App\Support\FormE2eScoringManifest;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class FormE2eScoringNanoGptTest extends TestCase
{
    #[Test]
    #[Group('nanogpt-live')]
    public function nanogpt_scores_form_fixture_answers(): void
    {
        if (! filter_var(getenv('NANOGPT_LIVE_TESTS') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set NANOGPT_LIVE_TESTS=1 to run form fixture NanoGPT scoring (Sail/local only).');
        }

        if (blank(config('services.nanogpt.api_key'))) {
            $this->markTestSkipped('NANOGPT_API_KEY is required for live form E2E scoring.');
        }

        if (! is_file(base_path(FormE2eScoringManifest::MANIFEST_PATH))) {
            $this->markTestSkipped('Run: node scripts/form-corpus/build-form-e2e-scoring-scenarios.mjs');
        }

        $limit = (int) (getenv('FORM_E2E_SCORING_LIMIT') ?: 3);
        $limit = max(1, min($limit, 10));

        $report = app(FormE2eScoringAuditor::class)->run($limit, scoreBatchSize: 3);
        $summary = $report['summary'];

        $this->assertGreaterThan(0, $report['fixture_count'] ?? 0);
        $this->assertGreaterThan(0, $report['question_count'] ?? 0);
        $this->assertGreaterThanOrEqual(0.5, $summary['pass_rate'] ?? 0.0, 'Pass rate below 50% on form fixture sample');
    }

    #[Test]
    public function form_e2e_scoring_manifest_has_one_hundred_fifty_scenarios(): void
    {
        if (! is_file(base_path(FormE2eScoringManifest::MANIFEST_PATH))) {
            $this->markTestSkipped('Run: node scripts/form-corpus/build-form-e2e-scoring-scenarios.mjs');
        }

        $manifest = FormE2eScoringManifest::load();

        $this->assertGreaterThanOrEqual(150, count($manifest['scenarios']));
        $this->assertSame(150, $manifest['target_count'] ?? null);
    }
}
