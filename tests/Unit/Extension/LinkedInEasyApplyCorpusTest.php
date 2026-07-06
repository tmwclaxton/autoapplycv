<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class LinkedInEasyApplyCorpusTest extends TestCase
{
    public function test_manifest_has_fifty_linkedin_easy_apply_scenarios(): void
    {
        $capturedManifestPath = base_path('tests/fixtures/auto-apply/linkedin/captured-manifest.json');

        if (is_file($capturedManifestPath)) {
            $captured = json_decode((string) file_get_contents($capturedManifestPath), true, 512, JSON_THROW_ON_ERROR);
            $capturedScenarios = $captured['scenarios'] ?? [];

            if (count($capturedScenarios) >= 50) {
                $this->assertGreaterThanOrEqual(
                    50,
                    count($capturedScenarios),
                    'Expected at least 50 live-captured LinkedIn Easy Apply scenarios.',
                );

                return;
            }
        }

        $manifestPath = base_path('tests/fixtures/auto-apply/linkedin/manifest.json');

        $this->assertFileExists($manifestPath);

        $manifest = json_decode((string) file_get_contents($manifestPath), true, 512, JSON_THROW_ON_ERROR);
        $scenarios = $manifest['scenarios'] ?? [];

        $this->assertCount(50, $scenarios, 'Expected 50 LinkedIn Easy Apply corpus scenarios.');
    }

    public function test_linkedin_easy_apply_corpus_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(120)
            ->run(['node', 'scripts/extension-test/linkedin-easy-apply-corpus.mjs']);

        $this->assertTrue(
            $result->successful(),
            'LinkedIn Easy Apply corpus script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }

    public function test_linkedin_location_typeahead_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(120)
            ->run(['node', 'scripts/extension-test/linkedin-location-typeahead.mjs']);

        $this->assertTrue(
            $result->successful(),
            'LinkedIn location typeahead script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
