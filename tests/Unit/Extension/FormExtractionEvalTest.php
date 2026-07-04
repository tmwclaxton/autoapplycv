<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\Support\FormExtractionScenarioCatalog;
use Tests\Support\FormExtractionScenarioEvaluator;
use Tests\TestCase;

class FormExtractionEvalTest extends TestCase
{
    private FormExtractionScenarioEvaluator $evaluator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->evaluator = new FormExtractionScenarioEvaluator;
    }

    public function test_corpus_has_hundreds_of_scenarios(): void
    {
        $this->assertGreaterThanOrEqual(
            100,
            FormExtractionScenarioCatalog::count(),
            'Expected at least 100 form extraction scenarios in the corpus.',
        );
    }

    public function test_vetted_corpus_has_hundreds_of_scenarios(): void
    {
        $this->assertGreaterThanOrEqual(
            100,
            FormExtractionScenarioCatalog::vettedCount(),
            'Expected at least 100 vetted form extraction scenarios. Run npm run form-corpus:vet.',
        );
    }

    public function test_all_vetted_scenarios_match_expected_snapshot_extraction(): void
    {
        if (! filter_var(getenv('FORM_CORPUS_FULL_EVAL') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set FORM_CORPUS_FULL_EVAL=1 to run the full vetted extraction eval.');
        }

        $snapshots = $this->loadAllSnapshots();
        $failures = [];

        foreach (FormExtractionScenarioCatalog::vetted() as $scenario) {
            $id = (string) $scenario['id'];
            $expected = FormExtractionScenarioCatalog::expectedFor($id);
            $snapshot = $snapshots[$id] ?? null;

            if (! is_array($snapshot)) {
                $failures[$id] = ['Snapshot missing from run-snapshot --all output.'];

                continue;
            }

            $result = $this->evaluator->evaluate($expected, $snapshot);

            if (! $result['passed']) {
                $failures[$id] = $result['reasons'];
            }
        }

        $summary = collect($failures)
            ->take(15)
            ->map(static fn (array $reasons, string $id): string => $id.': '.implode(' | ', $reasons))
            ->implode("\n");

        $this->assertSame(
            [],
            $failures,
            FormExtractionScenarioCatalog::vettedCount().' vetted scenarios evaluated. Failures ('.count($failures)."):\n".$summary,
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function loadAllSnapshots(): array
    {
        $snapshotsPath = base_path('tests/fixtures/form-extraction/snapshots.json');

        $result = Process::path(base_path())
            ->timeout(900)
            ->run(['node', 'scripts/form-corpus/run-snapshot.mjs', '--all', '--workers=8']);

        $this->assertTrue(
            $result->successful(),
            'Snapshot runner failed: '.$result->errorOutput(),
        );

        $this->assertFileExists($snapshotsPath, 'Snapshot runner did not write snapshots.json.');

        $decoded = json_decode((string) file_get_contents($snapshotsPath), true);

        $this->assertIsArray($decoded);

        return $decoded;
    }
}
