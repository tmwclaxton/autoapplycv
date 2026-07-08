<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class LinkedInAutoApplyTest extends TestCase
{
    public function test_linkedin_auto_apply_unit_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(90)
            ->run(['node', 'scripts/extension-test/linkedin-auto-apply.mjs']);

        $this->assertTrue(
            $result->successful(),
            'LinkedIn auto-apply unit script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }

    public function test_auto_apply_fit_unit_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/auto-apply-fit.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Auto Apply fit unit script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }

    public function test_auto_apply_filters_fit_integration_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/auto-apply-filters-fit-integration.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Auto Apply filters/fit integration script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }

    public function test_auto_apply_fit_orchestration_offline_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/auto-apply-fit-orchestration.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Auto Apply fit orchestration offline script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
