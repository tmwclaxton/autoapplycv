<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillExtensionE2eTest extends TestCase
{
    /**
     * @group extension-e2e
     */
    public function test_extension_fill_e2e_passes_with_mocked_api(): void
    {
        if (! filter_var(getenv('EXTENSION_E2E') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set EXTENSION_E2E=1 and run npm run build:extension to run extension fill E2E.');
        }

        $build = Process::path(base_path())
            ->timeout(180)
            ->run(['npm', 'run', 'build:extension']);

        $this->assertTrue($build->successful(), 'Extension build failed: '.$build->errorOutput());

        $result = Process::path(base_path())
            ->timeout(600)
            ->env(['EXTENSION_E2E' => '1'])
            ->run(['node', 'scripts/form-corpus/run-extension-fill-e2e.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Extension fill E2E failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
