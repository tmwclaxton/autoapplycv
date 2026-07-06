<?php

namespace Tests\Unit\Extension;

use Symfony\Component\Process\Process;
use Tests\Support\FormExtractionScenarioCatalog;
use Tests\TestCase;

class WeirdFormCorpusTest extends TestCase
{
    private const ID_PREFIX = 'syn-weird-';

    private const EXPECTED_COUNT = 60;

    public function test_manifest_has_60_weird_scenarios(): void
    {
        $weird = array_values(array_filter(
            FormExtractionScenarioCatalog::all(),
            static fn (array $scenario): bool => str_starts_with((string) ($scenario['id'] ?? ''), self::ID_PREFIX),
        ));

        $this->assertCount(
            self::EXPECTED_COUNT,
            $weird,
            'Expected exactly 60 syn-weird-* scenarios. Run: npm run form-corpus:generate-weird',
        );
    }

    public function test_each_weird_scenario_has_expected_json_notes_and_is_vetted(): void
    {
        $weird = array_values(array_filter(
            FormExtractionScenarioCatalog::all(),
            static fn (array $scenario): bool => str_starts_with((string) ($scenario['id'] ?? ''), self::ID_PREFIX),
        ));

        $this->assertCount(self::EXPECTED_COUNT, $weird);

        $failures = [];
        $notesSeen = [];

        foreach ($weird as $scenario) {
            $id = (string) $scenario['id'];

            try {
                $expected = FormExtractionScenarioCatalog::expectedFor($id);
            } catch (\Throwable $exception) {
                $failures[$id] = [$exception->getMessage()];

                continue;
            }

            $fields = $expected['fields'] ?? [];

            if (count($fields) < 2) {
                $failures[$id][] = 'field count '.count($fields).' < 2';
            }

            $notes = (string) ($scenario['notes'] ?? '');

            if ($notes === '') {
                $failures[$id][] = 'missing manifest notes';
            } elseif (isset($notesSeen[$notes])) {
                $failures[$id][] = 'duplicate notes with '.$notesSeen[$notes];
            } else {
                $notesSeen[$notes] = $id;
            }

            if (($scenario['status'] ?? '') !== 'vetted') {
                $failures[$id][] = 'status '.($scenario['status'] ?? 'pending').' != vetted';
            }
        }

        $summary = collect($failures)
            ->take(10)
            ->map(static fn (array $reasons, string $id): string => $id.': '.implode('; ', $reasons))
            ->implode("\n");

        $this->assertSame(
            [],
            $failures,
            count($failures).' weird scenario validation failures:'."\n".$summary,
        );
    }

    public function test_validate_weird_corpus_script_passes(): void
    {
        $process = new Process(
            ['node', 'scripts/form-corpus/validate-weird-corpus.mjs'],
            base_path(),
        );
        $process->run();

        $this->assertTrue(
            $process->isSuccessful(),
            "validate-weird-corpus.mjs failed:\n".$process->getErrorOutput().$process->getOutput(),
        );
    }
}
