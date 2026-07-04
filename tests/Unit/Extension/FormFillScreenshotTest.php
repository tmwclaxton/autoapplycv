<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillScreenshotTest extends TestCase
{
    /**
     * OCR strings we expect to appear only after autofill on the Ashby Notion fixture.
     *
     * @var list<string>
     */
    private const OCR_EXPECTATIONS = [
        'TestUser AshbyFill',
        'ashbyfill.test',
        'OCR-FILL',
        'linkedin.com/in',
    ];

    public function test_ashby_notion_fixture_fill_screenshot_ocr_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(300)
            ->run(['node', 'scripts/form-corpus/run-fill-screenshot-test.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Ashby Notion fill screenshot OCR test failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/output/form-fill-screenshots/web-ashby-notion-bdm-f603aedb/ocr-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $this->assertIsArray($report);
        $this->assertTrue($report['passed'] ?? false, 'OCR report marked test as failed.');
        $this->assertFalse($report['live'] ?? true, 'Fixture test should not use the live URL.');

        foreach (self::OCR_EXPECTATIONS as $expected) {
            $this->assertStringContainsString(
                $expected,
                (string) ($report['ocrComparison']['summary'] ?? ''),
                "Missing OCR expectation summary for {$expected}.",
            );
        }
    }

    /**
     * @group integration
     * @group live-network
     */
    public function test_ashby_notion_live_fill_screenshot_ocr_passes(): void
    {
        if (! filter_var(getenv('FILL_SCREENSHOT_LIVE') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FILL_SCREENSHOT_LIVE=1 to run the live Ashby Notion screenshot OCR test.');
        }

        $result = Process::path(base_path())
            ->timeout(300)
            ->run(['node', 'scripts/form-corpus/run-fill-screenshot-test.mjs', '--live']);

        $this->assertTrue(
            $result->successful(),
            'Live Ashby Notion fill screenshot OCR test failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
