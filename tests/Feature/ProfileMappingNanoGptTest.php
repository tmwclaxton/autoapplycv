<?php

namespace Tests\Feature;

use App\Services\ProfileMappingNanoGptAuditor;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ProfileMappingNanoGptTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadVetScenarios(): array
    {
        $path = base_path('scripts/extension-benchmark/profile-mapping-corpus.json');

        if (! is_file($path)) {
            $this->markTestSkipped('Run node scripts/extension-benchmark/build-profile-mapping-corpus.mjs first.');
        }

        $corpus = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        $scenarios = [];

        foreach ($corpus['scenarios'] ?? [] as $scenario) {
            if (($scenario['expect']['vet_with_nanogpt'] ?? false) !== true) {
                continue;
            }

            $scenarios[] = $scenario;
        }

        if ($scenarios === []) {
            $this->markTestSkipped('No vet_with_nanogpt scenarios found in corpus.');
        }

        return $scenarios;
    }

    #[Test]
    #[Group('nanogpt-live')]
    public function nanogpt_vets_ambiguous_profile_mappings(): void
    {
        if (! filter_var(getenv('NANOGPT_LIVE_TESTS') ?: '', FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set NANOGPT_LIVE_TESTS=1 to run NanoGPT profile mapping vetting (Sail/local only).');
        }

        if (blank(config('services.nanogpt.api_key'))) {
            $this->markTestSkipped('NANOGPT_API_KEY is required for live profile mapping vetting.');
        }

        $scenarios = $this->loadVetScenarios();
        $auditor = app(ProfileMappingNanoGptAuditor::class);
        $failures = [];

        foreach (array_chunk($scenarios, 8) as $batch) {
            $payload = array_map(static function (array $scenario): array {
                $expect = $scenario['expect'] ?? [];

                return [
                    'id' => $scenario['id'],
                    'label' => $scenario['label'],
                    'proposed_profile_path' => $expect['profile_path'] ?? null,
                    'proposed_profile_label' => is_string($expect['profile_path'] ?? null)
                        ? str_replace(['application_settings.', 'full_name.', '_'], ['', '', ' '], (string) $expect['profile_path'])
                        : null,
                    'field_type' => $scenario['field']['field_type'] ?? null,
                    'options' => $scenario['field']['options'] ?? null,
                ];
            }, $batch);

            $results = $auditor->vetBatch($payload);

            if ($results === []) {
                $failures[] = 'NanoGPT returned no vetting results for batch starting '.$batch[0]['id'];

                continue;
            }

            $resultsById = collect($results)->keyBy('id');

            foreach ($batch as $scenario) {
                $expectedAppropriate = (bool) ($scenario['expect']['nanogpt_expect_appropriate'] ?? false);
                $result = $resultsById->get($scenario['id']);

                if ($result === null) {
                    $failures[] = $scenario['id'].': missing NanoGPT result';

                    continue;
                }

                if ($result['appropriate'] !== $expectedAppropriate) {
                    $failures[] = $scenario['id'].': expected appropriate='.($expectedAppropriate ? 'true' : 'false')
                        .', got '.($result['appropriate'] ? 'true' : 'false')
                        .' ('.$result['reason'].')';
                }
            }
        }

        $this->assertSame([], $failures, implode("\n", $failures));
    }
}
