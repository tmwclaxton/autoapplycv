<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillValidationBannerTest extends TestCase
{
    public function test_ashby_notion_fixture_has_no_validation_error_banner_after_fill(): void
    {
        $result = Process::path(base_path())
            ->timeout(300)
            ->run([
                'node',
                'scripts/form-corpus/run-fill-verify.mjs',
                '--json-only',
                '--id=web-ashby-notion-bdm-f603aedb',
                '--check-errors',
            ]);

        $this->assertTrue(
            $result->successful(),
            'Ashby Notion error-banner fill verify failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-verify-report.json');

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $scenario = collect($report['results'] ?? [])->firstWhere('id', 'web-ashby-notion-bdm-f603aedb');

        $this->assertIsArray($scenario);
        $this->assertTrue($scenario['checks']['errorBanner']['passed'] ?? false);
        $this->assertSame(0, $scenario['checks']['errorBanner']['error_count'] ?? -1);
    }

    public function test_ashby_notion_screenshot_diff_reports_no_error_banner(): void
    {
        $result = Process::path(base_path())
            ->timeout(300)
            ->run(['node', 'scripts/form-corpus/run-fill-screenshot-diff.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Screenshot diff test failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/output/form-fill-screenshots/web-ashby-notion-bdm-f603aedb/pixel-diff-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $this->assertTrue($report['errorBanner']['passed'] ?? false);
        $this->assertTrue($report['pixelDiff']['passed'] ?? false);
    }

    /**
     * @group extension-e2e
     */
    public function test_extension_fill_e2e_passes_when_enabled(): void
    {
        if (! filter_var(getenv('EXTENSION_E2E') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set EXTENSION_E2E=1 and run npm run build:extension to run extension fill E2E.');
        }

        $build = Process::path(base_path())
            ->timeout(120)
            ->run(['npm', 'run', 'build:extension']);

        $this->assertTrue($build->successful(), 'Extension build failed: '.$build->errorOutput());

        $result = Process::path(base_path())
            ->timeout(300)
            ->env(['EXTENSION_E2E' => '1'])
            ->run(['node', 'scripts/form-corpus/run-extension-fill-e2e.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Extension fill E2E failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
