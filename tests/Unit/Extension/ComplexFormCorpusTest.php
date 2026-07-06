<?php

namespace Tests\Unit\Extension;

use Symfony\Component\Process\Process;
use Tests\Support\FormExtractionScenarioCatalog;
use Tests\TestCase;

class ComplexFormCorpusTest extends TestCase
{
    private const ID_PREFIX = 'syn-complex-500-';

    private const EXPECTED_COUNT = 500;

    public function test_manifest_has_500_complex_scenarios(): void
    {
        $complex = array_values(array_filter(
            FormExtractionScenarioCatalog::all(),
            static fn (array $scenario): bool => str_starts_with((string) ($scenario['id'] ?? ''), self::ID_PREFIX),
        ));

        $this->assertCount(
            self::EXPECTED_COUNT,
            $complex,
            'Expected exactly 500 syn-complex-500-* scenarios. Run: npm run form-corpus:generate-complex-500',
        );
    }

    public function test_each_complex_scenario_has_expected_json_and_meets_complexity_thresholds(): void
    {
        $complex = array_values(array_filter(
            FormExtractionScenarioCatalog::all(),
            static fn (array $scenario): bool => str_starts_with((string) ($scenario['id'] ?? ''), self::ID_PREFIX),
        ));

        $this->assertCount(self::EXPECTED_COUNT, $complex);

        $failures = [];

        foreach ($complex as $scenario) {
            $id = (string) $scenario['id'];

            try {
                $expected = FormExtractionScenarioCatalog::expectedFor($id);
            } catch (\Throwable $exception) {
                $failures[$id] = [$exception->getMessage()];

                continue;
            }

            $fields = $expected['fields'] ?? [];
            $fieldTypes = array_values(array_unique(array_map(
                static fn (array $field): string => (string) ($field['field_type'] ?? 'text'),
                $fields,
            )));

            if (count($fields) < 10) {
                $failures[$id][] = 'field count '.count($fields).' < 10';
            }

            if (count($fieldTypes) < 4) {
                $failures[$id][] = 'field types '.count($fieldTypes).' < 4';
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
            count($failures).' complex scenario validation failures:'."\n".$summary,
        );
    }

    public function test_complex_corpus_validation_script_passes(): void
    {
        $process = new Process(
            ['node', 'scripts/form-corpus/validate-complex-corpus.mjs'],
            base_path(),
        );
        $process->run();

        $this->assertTrue(
            $process->isSuccessful(),
            "validate-complex-corpus.mjs failed:\n".$process->getErrorOutput().$process->getOutput(),
        );
    }
}
