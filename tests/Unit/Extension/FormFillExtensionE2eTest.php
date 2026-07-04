<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillExtensionE2eTest extends TestCase
{
    /**
     * @group extension-e2e
     */
    public function test_extension_fill_e2e_ci_subset_passes_with_mocked_api(): void
    {
        if (! filter_var(getenv('EXTENSION_E2E') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set EXTENSION_E2E=1 and run npm run build:extension to run extension fill E2E.');
        }

        if (filter_var(getenv('EXTENSION_E2E_FULL') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('CI subset skipped when EXTENSION_E2E_FULL=1 (see test_e2e_manifest_scenarios_pass).');
        }

        $this->runExtensionE2eBatch(['--ci']);
    }

    /**
     * @group extension-e2e
     */
    public function test_e2e_manifest_scenarios_pass(): void
    {
        if (! filter_var(getenv('EXTENSION_E2E') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set EXTENSION_E2E=1 and run npm run build:extension to run extension fill E2E.');
        }

        if (! filter_var(getenv('EXTENSION_E2E_FULL') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set EXTENSION_E2E_FULL=1 to run the full ~100 scenario E2E manifest.');
        }

        $this->runExtensionE2eBatch(['--all']);
    }

    /**
     * @param  list<string>  $extraArgs
     */
    private function runExtensionE2eBatch(array $extraArgs = []): void
    {
        $build = Process::path(base_path())
            ->timeout(180)
            ->run(['npm', 'run', 'build:extension']);

        $this->assertTrue($build->successful(), 'Extension build failed: '.$build->errorOutput());

        $generate = Process::path(base_path())
            ->timeout(600)
            ->run(['node', 'scripts/form-corpus/generate-e2e-mocks.mjs', '--manifest']);

        $this->assertTrue(
            $generate->successful(),
            'E2E mock generation failed:'."\n".$generate->errorOutput().$generate->output(),
        );

        $env = ['EXTENSION_E2E' => '1'];

        if (in_array('--all', $extraArgs, true)) {
            $env['EXTENSION_E2E_FULL'] = '1';
        }

        $result = Process::path(base_path())
            ->timeout(in_array('--all', $extraArgs, true) ? 7200 : 900)
            ->env($env)
            ->run(array_merge(['node', 'scripts/form-corpus/run-extension-fill-e2e-batch.mjs'], $extraArgs));

        $this->assertTrue(
            $result->successful(),
            'Extension fill E2E batch failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
