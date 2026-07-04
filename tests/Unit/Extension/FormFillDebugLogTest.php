<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class FormFillDebugLogTest extends TestCase
{
    public function test_debug_log_analyzer_matches_ashby_notion_golden_summary(): void
    {
        $fixturePath = base_path('tests/fixtures/form-fill-logs/web-ashby-notion-bdm-f603aedb.export.json');
        $goldenPath = base_path('tests/fixtures/form-fill-logs/web-ashby-notion-bdm-f603aedb.summary.json');

        $this->assertFileExists($fixturePath);
        $this->assertFileExists($goldenPath);

        $result = Process::path(base_path())
            ->timeout(60)
            ->run([
                'node',
                'scripts/form-corpus/analyze-debug-log.mjs',
                '--input='.$fixturePath,
                '--golden='.$goldenPath,
                '--json-only',
            ]);

        $this->assertTrue(
            $result->successful(),
            'Debug log analyzer failed:'."\n".$result->errorOutput().$result->output(),
        );

        /** @var array<string, mixed> $analysis */
        $analysis = json_decode($result->output(), true);

        $this->assertTrue($analysis['passed'] ?? false, implode(', ', $analysis['failures'] ?? []));
    }

    public function test_summarize_log_export_structure(): void
    {
        $fixturePath = base_path('tests/fixtures/form-fill-logs/web-ashby-notion-bdm-f603aedb.export.json');

        $result = Process::path(base_path())
            ->timeout(60)
            ->run([
                'node',
                'scripts/form-corpus/analyze-debug-log.mjs',
                '--input='.$fixturePath,
            ]);

        $this->assertTrue($result->successful(), $result->errorOutput());

        /** @var array<string, mixed> $summary */
        $summary = json_decode($result->output(), true);

        $this->assertArrayHasKey('total', $summary);
        $this->assertArrayHasKey('by_level', $summary);
        $this->assertArrayHasKey('by_source', $summary);
        $this->assertArrayHasKey('phases', $summary);
    }
}
