<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillEvalTest extends TestCase
{
    public function test_react_and_ashby_fill_harness_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(120)
            ->run(['node', 'scripts/form-corpus/lib/fill-runner.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Fill eval harness failed: '.$result->errorOutput().$result->output(),
        );
    }
}
