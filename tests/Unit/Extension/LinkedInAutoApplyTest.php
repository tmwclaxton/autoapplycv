<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class LinkedInAutoApplyTest extends TestCase
{
    public function test_linkedin_auto_apply_unit_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/linkedin-auto-apply.mjs']);

        $this->assertTrue(
            $result->successful(),
            'LinkedIn auto-apply unit script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
