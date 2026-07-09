<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class DraftAllExtensionTest extends TestCase
{
    /**
     * @return list<string>
     */
    private function draftAllExtensionScripts(): array
    {
        return [
            'scripts/extension-benchmark/test-draft-all-optimizations.mjs',
            'scripts/extension-test/draft-all-pipeline.test.mjs',
            'scripts/extension-test/draft-all-stream.test.mjs',
            'scripts/extension-test/portal-bar.test.mjs',
        ];
    }

    public function test_draft_all_extension_unit_scripts_pass(): void
    {
        foreach ($this->draftAllExtensionScripts() as $script) {
            $result = Process::path(base_path())
                ->timeout(60)
                ->run(['node', $script]);

            $this->assertTrue(
                $result->successful(),
                "{$script} failed:\n".$result->errorOutput().$result->output(),
            );
        }
    }
}
