<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillCuratedTest extends TestCase
{
    public function test_curated_jsdom_fill_verification_passes(): void
    {
        $report = $this->runCuratedFillVerify([
            '--check-validity',
            '--check-a11y',
            '--check-errors',
            '--workers=8',
        ]);

        $this->assertSame('jsdom', $report['verify_engine'] ?? null);

        $thresholds = $report['thresholds'] ?? [];
        $criticalThreshold = (float) ($thresholds['critical_pass_rate'] ?? 0.9);
        $overallThreshold = (float) ($thresholds['overall_pass_rate'] ?? 0.8);

        $this->assertGreaterThanOrEqual(
            $criticalThreshold,
            (float) ($report['totals']['critical_pass_rate'] ?? 0),
            'Curated JSDOM critical pass rate below threshold.',
        );

        $this->assertGreaterThanOrEqual(
            $overallThreshold,
            (float) ($report['totals']['pass_rate'] ?? 0),
            'Curated JSDOM overall pass rate below threshold.',
        );

        foreach (['domReadback', 'html5Validity', 'a11yState', 'errorBanner'] as $layer) {
            $passRate = (float) ($report['by_check'][$layer]['pass_rate'] ?? 0);

            $this->assertGreaterThanOrEqual(
                0.9,
                $passRate,
                "Curated JSDOM {$layer} pass rate below 90%.",
            );
        }
    }

    /**
     * @group playwright
     */
    public function test_curated_playwright_fill_verification_passes_for_priority_tier(): void
    {
        if (! filter_var(getenv('FORM_CORPUS_PLAYWRIGHT') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_PLAYWRIGHT=1 to run curated Playwright fill verification.');
        }

        $report = $this->runCuratedPlaywrightFillVerify();

        $this->assertSame('playwright', $report['verify_engine'] ?? null);

        $thresholds = $report['thresholds'] ?? [];
        $criticalThreshold = (float) ($thresholds['critical_pass_rate'] ?? 0.5);
        $overallThreshold = (float) ($thresholds['overall_pass_rate'] ?? 0.45);

        $this->assertGreaterThanOrEqual(
            $criticalThreshold,
            (float) ($report['totals']['critical_pass_rate'] ?? 0),
            'Curated Playwright critical pass rate below threshold.',
        );

        $this->assertGreaterThanOrEqual(
            $overallThreshold,
            (float) ($report['totals']['pass_rate'] ?? 0),
            'Curated Playwright overall pass rate below threshold.',
        );
    }

    /**
     * @group playwright
     */
    public function test_platform_smoke_playwright_passes(): void
    {
        if (! filter_var(getenv('FORM_CORPUS_PLAYWRIGHT') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_PLAYWRIGHT=1 to run platform smoke Playwright tests.');
        }

        $result = Process::path(base_path())
            ->timeout(900)
            ->run(['node', 'scripts/form-corpus/run-fill-verify-smoke.mjs', '--json-only']);

        $this->assertTrue(
            $result->successful(),
            'Platform smoke Playwright fill verify failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-smoke-playwright-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $thresholds = $report['thresholds'] ?? [];
        $criticalThreshold = (float) ($thresholds['critical_pass_rate'] ?? 0.5);
        $overallThreshold = (float) ($thresholds['overall_pass_rate'] ?? 0.45);

        $this->assertGreaterThanOrEqual(
            $criticalThreshold,
            (float) ($report['totals']['critical_pass_rate'] ?? 0),
            'Smoke Playwright critical pass rate below threshold.',
        );

        $this->assertGreaterThanOrEqual(
            $overallThreshold,
            (float) ($report['totals']['pass_rate'] ?? 0),
            'Smoke Playwright overall pass rate below threshold.',
        );

        $this->assertSame(
            $report['totals']['ashby_widget_total'] ?? 0,
            $report['totals']['ashby_widget_passed'] ?? 0,
            'Ashby yes/no and checkbox widget smoke checks failed.',
        );
    }

    public function test_curated_platform_coverage(): void
    {
        $manifest = $this->loadCuratedManifest();

        $platforms = collect($manifest['scenarios'] ?? [])
            ->pluck('platform')
            ->unique()
            ->values();

        $minPlatforms = (int) ($manifest['thresholds']['min_platforms'] ?? 12);

        $this->assertGreaterThanOrEqual(
            $minPlatforms,
            $platforms->count(),
            'Curated manifest platform coverage below minimum: '.$platforms->implode(', '),
        );

        foreach (['greenhouse', 'ashby', 'lever', 'smartrecruiters', 'workday', 'syn-fw', 'syn-ix', 'syn-mega'] as $required) {
            $this->assertTrue(
                $platforms->contains($required),
                "Curated manifest missing required platform: {$required}",
            );
        }
    }

    /**
     * @param  list<string>  $args
     * @return array<string, mixed>
     */
    private function runCuratedFillVerify(array $args): array
    {
        $result = Process::path(base_path())
            ->timeout(900)
            ->run(array_merge(['node', 'scripts/form-corpus/run-fill-verify-curated.mjs', '--json-only'], $args));

        $this->assertTrue(
            $result->successful(),
            'Curated JSDOM fill verify failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-curated-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $this->assertIsArray($report);

        return $report;
    }

    /**
     * @return array<string, mixed>
     */
    private function runCuratedPlaywrightFillVerify(): array
    {
        $result = Process::path(base_path())
            ->timeout(900)
            ->run(['node', 'scripts/form-corpus/run-fill-verify-playwright.mjs', '--json-only']);

        $this->assertTrue(
            $result->successful(),
            'Curated Playwright fill verify failed:'."\n".$result->errorOutput().$result->output(),
        );

        $reportPath = base_path('tests/fixtures/form-extraction/fill-curated-playwright-report.json');

        $this->assertFileExists($reportPath);

        /** @var array<string, mixed> $report */
        $report = json_decode((string) file_get_contents($reportPath), true);

        $this->assertIsArray($report);

        return $report;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadCuratedManifest(): array
    {
        $path = base_path('tests/fixtures/form-extraction/fill-verify-curated.json');

        $this->assertFileExists($path);

        /** @var array<string, mixed> $manifest */
        $manifest = json_decode((string) file_get_contents($path), true);

        $this->assertIsArray($manifest);

        return $manifest;
    }
}
