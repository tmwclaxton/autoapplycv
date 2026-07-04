<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillVisualRegressionTest extends TestCase
{
    /**
     * @group playwright
     */
    public function test_smoke_visual_regression_baselines_match(): void
    {
        if (! filter_var(getenv('FORM_CORPUS_PLAYWRIGHT') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_PLAYWRIGHT=1 to run visual regression tests.');
        }

        $result = Process::path(base_path())
            ->timeout(900)
            ->run(['node', 'scripts/form-corpus/run-visual-regression.mjs', '--json-only']);

        $this->assertTrue(
            $result->successful(),
            'Visual regression failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-visual-regression-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $this->assertGreaterThanOrEqual(
            1,
            (float) ($report['totals']['pass_rate'] ?? 0),
            'Visual regression pass rate below 100%.',
        );
    }
}
