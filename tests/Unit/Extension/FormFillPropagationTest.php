<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillPropagationTest extends TestCase
{
    public function test_framework_and_basic_fill_propagation_passes(): void
    {
        if (! filter_var(getenv('FORM_CORPUS_HEAVY') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_HEAVY=1 to run fill propagation tests.');
        }

        $report = $this->runFillVerify([
            '--id-prefix=syn-fw-',
            '--workers=8',
        ]);

        $basicReport = $this->runFillVerify([
            '--id-prefix=syn-basic-',
            '--workers=4',
        ]);

        $combinedStacks = array_merge(
            $report['by_stack'] ?? [],
            $basicReport['by_stack'] ?? [],
        );

        $failures = array_merge(
            $this->collectFailures($report),
            $this->collectFailures($basicReport),
        );

        $summary = $this->formatStackSummary($combinedStacks);
        $failureSummary = collect($failures)
            ->take(15)
            ->map(static fn (array $failure): string => $failure['id'].': '.$failure['detail'])
            ->implode("\n");

        $this->assertSame(
            0,
            count($failures),
            'Fill propagation failures ('.count($failures)."):\n".$failureSummary."\n\nBy stack:\n".$summary,
        );

        $this->assertGreaterThanOrEqual(
            100,
            ($report['totals']['evaluated'] ?? 0),
            'Expected at least 100 framework scenarios in fill verify run.',
        );

        $this->assertGreaterThanOrEqual(
            5,
            ($basicReport['totals']['evaluated'] ?? 0),
            'Expected all syn-basic scenarios in fill verify run.',
        );
    }

    public function test_interactive_fill_propagation_passes_when_enabled(): void
    {
        if (! env('FORM_CORPUS_FILL_VERIFY_INTERACTIVE')) {
            $this->markTestSkipped('Set FORM_CORPUS_FILL_VERIFY_INTERACTIVE=1 to run syn-ix fill propagation.');
        }

        $report = $this->runFillVerify([
            '--id-prefix=syn-ix-',
            '--workers=4',
        ]);

        $failures = $this->collectFailures($report);

        $this->assertSame(
            0,
            count($failures),
            "Interactive fill propagation failures:\n".collect($failures)->take(10)->implode("\n"),
        );
    }

    public function test_mega_sample_fill_propagation_when_enabled(): void
    {
        if (! env('FORM_CORPUS_FILL_VERIFY_MEGA')) {
            $this->markTestSkipped('Set FORM_CORPUS_FILL_VERIFY_MEGA=1 to run syn-mega fill propagation sample.');
        }

        $report = $this->runFillVerify([
            '--id-prefix=syn-mega-',
            '--include-mega',
            '--mega-sample=20',
            '--workers=8',
        ]);

        $evaluated = (int) ($report['totals']['evaluated'] ?? 0);
        $passed = (int) ($report['totals']['passed'] ?? 0);
        $passRate = $evaluated === 0 ? 0.0 : $passed / $evaluated;

        $this->assertGreaterThanOrEqual(
            0.9,
            $passRate,
            'Mega sample pass rate below 90%: '.$this->formatStackSummary($report['by_stack'] ?? []),
        );
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

        $this->assertFileExists($reportPath, 'Fill verify runner did not write fill-verify-report.json.');

        $decoded = json_decode((string) file_get_contents($reportPath), true);

        $this->assertIsArray($decoded);

        return $decoded;
    }

    /**
     * @param  array<string, mixed>  $report
     * @return list<array{id: string, detail: string}>
     */
    private function collectFailures(array $report): array
    {
        $failures = [];

        foreach ($report['results'] ?? [] as $result) {
            if (! is_array($result) || ($result['skipped'] ?? false) || ($result['passed'] ?? false)) {
                continue;
            }

            $id = (string) ($result['id'] ?? 'unknown');
            $first = $result['failures'][0] ?? null;
            $detail = is_array($first)
                ? (($first['stage'] ?? 'unknown').' '.($first['field'] ?? '').' expected="'.($first['expected'] ?? '').'" actual="'.json_encode($first['actual'] ?? null).'"')
                : 'unknown failure';

            $failures[] = ['id' => $id, 'detail' => $detail];
        }

        return $failures;
    }

    /**
     * @param  array<string, array{total: int, passed: int, failed: int}>  $stacks
     */
    private function formatStackSummary(array $stacks): string
    {
        ksort($stacks);

        $lines = [];

        foreach ($stacks as $stack => $stats) {
            $total = (int) ($stats['total'] ?? 0);
            $passed = (int) ($stats['passed'] ?? 0);
            $rate = $total === 0 ? 0.0 : ($passed / $total) * 100;
            $lines[] = sprintf('  %s: %d/%d (%.1f%%)', $stack, $passed, $total, $rate);
        }

        return implode("\n", $lines);
    }
}
