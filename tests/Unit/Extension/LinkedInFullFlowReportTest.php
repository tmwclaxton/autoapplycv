<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class LinkedInFullFlowReportTest extends TestCase
{
    public function test_linkedin_full_flow_report_parser_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/linkedin-full-flow-report.mjs']);

        $this->assertTrue(
            $result->successful(),
            'LinkedIn full-flow report parser failed:'."\n".$result->errorOutput().$result->output(),
        );
    }

    public function test_linkedin_auto_apply_offline_step_playwright_passes(): void
    {
        if (! filter_var(getenv('EXTENSION_E2E') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set EXTENSION_E2E=1 and run npm run build:extension for offline Playwright step tests.');
        }

        $build = Process::path(base_path())
            ->timeout(180)
            ->run(['npm', 'run', 'build:extension']);

        $this->assertTrue($build->successful(), 'Extension build failed: '.$build->errorOutput());

        $result = Process::path(base_path())
            ->timeout(120)
            ->run(['node', 'scripts/extension-test/linkedin-auto-apply-offline-step.mjs']);

        $this->assertTrue(
            $result->successful(),
            'LinkedIn offline step Playwright test failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
