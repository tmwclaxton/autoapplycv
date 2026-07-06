<?php

namespace Tests\Feature\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class LinkedInAutoApplyFullFlowTest extends TestCase
{
    /**
     * @group linkedin-live-e2e
     */
    public function test_linkedin_auto_apply_full_flow_submits_with_multi_step_advance(): void
    {
        if (! filter_var(getenv('LINKEDIN_LIVE_E2E') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set LINKEDIN_LIVE_E2E=1 to run the live LinkedIn full-flow E2E.');
        }

        if (! getenv('LINKEDIN_TEST_EMAIL') || ! getenv('LINKEDIN_TEST_PASSWORD')) {
            $this->markTestSkipped('LINKEDIN_TEST_EMAIL and LINKEDIN_TEST_PASSWORD are required for live LinkedIn E2E.');
        }

        $build = Process::path(base_path())
            ->timeout(180)
            ->run(['npm', 'run', 'build:extension']);

        $this->assertTrue($build->successful(), 'Extension build failed: '.$build->errorOutput());

        $result = Process::path(base_path())
            ->timeout(1800)
            ->env([
                'LINKEDIN_LIVE_E2E' => '1',
            ])
            ->run([
                'node',
                'scripts/extension-e2e/linkedin-auto-apply-full-flow.mjs',
                '--max-jobs=3',
                '--roles=software engineer',
            ]);

        $reportPath = base_path('tests/output/linkedin-auto-apply-full-flow/report.json');

        $this->assertFileExists($reportPath, 'Expected full-flow report.json to be written.');

        $report = json_decode((string) file_get_contents($reportPath), true, 512, JSON_THROW_ON_ERROR);

        $this->assertGreaterThanOrEqual(1, $report['applied'] ?? 0, $result->output());
        $this->assertGreaterThan(0, $report['steps_advanced_total'] ?? 0, $result->output());

        $this->assertTrue(
            $result->successful(),
            'LinkedIn full-flow E2E failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
