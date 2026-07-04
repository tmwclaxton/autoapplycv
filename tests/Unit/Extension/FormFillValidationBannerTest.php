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
        if (! filter_var(getenv('FORM_CORPUS_HEAVY') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_HEAVY=1 to run screenshot diff tests.');
        }

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
}
