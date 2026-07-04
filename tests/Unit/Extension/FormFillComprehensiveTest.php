<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillComprehensiveTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (! filter_var(getenv('FORM_CORPUS_HEAVY') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_HEAVY=1 to run comprehensive form fill tests.');
        }
    }

    public function test_framework_fill_passes_html5_validity_checks(): void
    {
        $report = $this->runFillVerify([
            '--id-prefix=syn-fw-',
            '--workers=8',
            '--check-validity',
        ]);

        $this->assertCheckLayerPassRate($report, 'html5Validity', 0.95);
        $this->assertSame(0, $this->countLayerFailures($report, 'html5Validity'));
    }

    public function test_basic_fill_passes_html5_validity_checks(): void
    {
        $report = $this->runFillVerify([
            '--id-prefix=syn-basic-',
            '--workers=4',
            '--check-validity',
        ]);

        $this->assertCheckLayerPassRate($report, 'html5Validity', 1.0);
    }

    public function test_framework_fill_passes_accessibility_state_checks(): void
    {
        $report = $this->runFillVerify([
            '--id-prefix=syn-fw-',
            '--workers=8',
            '--check-a11y',
        ]);

        $this->assertCheckLayerPassRate($report, 'a11yState', 0.95);
        $this->assertSame(0, $this->countLayerFailures($report, 'a11yState'));
    }

    public function test_basic_fill_passes_accessibility_state_checks(): void
    {
        $report = $this->runFillVerify([
            '--id-prefix=syn-basic-',
            '--workers=4',
            '--check-a11y',
        ]);

        $this->assertCheckLayerPassRate($report, 'a11yState', 1.0);
    }

    public function test_ashby_notion_fixture_passes_all_fill_verification_layers(): void
    {
        $report = $this->runFillVerify([
            '--id=web-ashby-notion-bdm-f603aedb',
            '--check-validity',
            '--check-a11y',
            '--check-errors',
        ]);

        $result = collect($report['results'] ?? [])->firstWhere('id', 'web-ashby-notion-bdm-f603aedb');

        $this->assertIsArray($result);
        $this->assertTrue($result['passed'] ?? false, 'Ashby Notion comprehensive fill verify failed.');

        foreach (['domReadback', 'html5Validity', 'a11yState', 'errorBanner'] as $layer) {
            $this->assertTrue(
                $result['checks'][$layer]['passed'] ?? false,
                "Ashby Notion {$layer} check failed.",
            );
        }
    }

    /**
     * @group playwright
     */
    public function test_ashby_notion_checkbox_fill_passes_in_playwright_chromium(): void
    {
        $result = Process::path(base_path())
            ->timeout(120)
            ->run(['node', 'scripts/form-corpus/run-ashby-checkbox-playwright.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Ashby Notion Playwright checkbox fill failed:'."\n".$result->errorOutput().$result->output(),
        );

        $decoded = json_decode($result->output(), true);

        $this->assertIsArray($decoded);
        $this->assertTrue($decoded['passed'] ?? false, 'Ashby Notion Playwright checkbox report not passed.');
        $this->assertTrue($decoded['reactLike']['checked'] ?? false, 'React-like Ashby checkbox was not checked.');
        $this->assertSame([], $decoded['fixture']['failures'] ?? null, 'Ashby Notion fixture checkbox fill failed.');
    }

    public function test_comprehensive_fill_report_passes_for_default_corpus_subset(): void
    {
        $result = Process::path(base_path())
            ->timeout(900)
            ->run(['node', 'scripts/form-corpus/run-fill-comprehensive.mjs', '--json-only']);

        $this->assertTrue(
            $result->successful(),
            'Comprehensive fill runner failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-comprehensive-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $this->assertIsArray($report);
        $this->assertSame(0, $report['totals']['failed'] ?? -1);
        $this->assertGreaterThanOrEqual(100, $report['totals']['evaluated'] ?? 0);

        foreach (['domReadback', 'html5Validity', 'a11yState', 'errorBanner'] as $layer) {
            $passRate = (float) ($report['by_check'][$layer]['pass_rate'] ?? 0);

            $this->assertGreaterThanOrEqual(
                1.0,
                $passRate,
                "Comprehensive {$layer} pass rate below 100%.",
            );
        }

        $this->assertTrue($report['screenshot_diff']['passed'] ?? false, 'Notion pixel diff check failed.');
    }

    /**
     * @param  list<string>  $args
     * @return array<string, mixed>
     */
    private function runFillVerify(array $args): array
    {
        $result = Process::path(base_path())
            ->timeout(600)
            ->run(array_merge(['node', 'scripts/form-corpus/run-fill-verify.mjs', '--json-only'], $args));

        $this->assertTrue(
            $result->successful(),
            'Fill verify runner failed: '.$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-verify-report.json');

        $this->assertFileExists($reportPath);

        $decoded = json_decode((string) file_get_contents($reportPath), true);

        $this->assertIsArray($decoded);

        return $decoded;
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function assertCheckLayerPassRate(array $report, string $layer, float $minimumRate): void
    {
        $stats = $report['by_check'][$layer] ?? null;

        $this->assertIsArray($stats, "Missing {$layer} summary in fill verify report.");

        $passRate = (float) ($stats['pass_rate'] ?? 0);

        $this->assertGreaterThanOrEqual(
            $minimumRate,
            $passRate,
            "{$layer} pass rate below ".($minimumRate * 100).'%: '
            .$stats['passed'].'/'.$stats['evaluated'],
        );
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function countLayerFailures(array $report, string $layer): int
    {
        $count = 0;

        foreach ($report['results'] ?? [] as $result) {
            if (! is_array($result) || ($result['skipped'] ?? false)) {
                continue;
            }

            if (($result['checks'][$layer]['passed'] ?? true) === false) {
                $count++;
            }
        }

        return $count;
    }
}
