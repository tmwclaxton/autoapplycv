<?php

namespace Tests\Unit\Support;

use App\Support\AssistAnswerQualityCorpus;
use App\Support\AssistAnswerQualityCorpusBuilder;
use Tests\TestCase;

class AssistAnswerQualityCorpusTest extends TestCase
{
    public function test_corpus_builds_at_least_forty_scenarios(): void
    {
        $corpus = AssistAnswerQualityCorpusBuilder::build();

        $this->assertSame(1, $corpus['version']);
        $this->assertGreaterThanOrEqual(40, count($corpus['scenarios']));
        $this->assertGreaterThanOrEqual(8, count($corpus['profile_personas']));

        AssistAnswerQualityCorpus::validate($corpus);
    }

    public function test_corpus_loads_from_file_when_present(): void
    {
        $path = base_path(AssistAnswerQualityCorpus::CORPUS_PATH);

        if (! is_file($path)) {
            AssistAnswerQualityCorpusBuilder::writeJsonFile($path);
        }

        $corpus = AssistAnswerQualityCorpus::load();

        $this->assertGreaterThanOrEqual(40, count($corpus['scenarios']));
    }

    public function test_scenarios_cover_multiple_categories_and_tones(): void
    {
        $corpus = AssistAnswerQualityCorpusBuilder::build();
        $categories = [];
        $locales = [];

        foreach ($corpus['scenarios'] as $scenario) {
            $categories[$scenario['category'] ?? 'unknown'] = ($categories[$scenario['category'] ?? 'unknown'] ?? 0) + 1;
            $locales[$scenario['tone']['locale'] ?? 'unknown'] = ($locales[$scenario['tone']['locale'] ?? 'unknown'] ?? 0) + 1;
        }

        $this->assertGreaterThanOrEqual(5, count($categories));
        $this->assertGreaterThanOrEqual(2, $locales['en-GB'] ?? 0);
        $this->assertGreaterThanOrEqual(1, $categories['advice'] ?? 0);
        $this->assertGreaterThanOrEqual(1, $categories['screening'] ?? 0);
        $this->assertGreaterThanOrEqual(1, $categories['salary'] ?? 0);
    }
}
