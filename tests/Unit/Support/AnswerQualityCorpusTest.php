<?php

namespace Tests\Unit\Support;

use App\Support\AnswerQualityCorpus;
use App\Support\AnswerQualityCorpusBuilder;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerQualityCorpusTest extends TestCase
{
    #[Test]
    public function built_corpus_has_at_least_one_hundred_scenarios(): void
    {
        $corpus = AnswerQualityCorpusBuilder::build();

        AnswerQualityCorpus::validate($corpus);

        $this->assertGreaterThanOrEqual(100, count($corpus['scenarios']));
        $this->assertGreaterThanOrEqual(8, count($corpus['profile_personas']));
    }

    #[Test]
    public function corpus_json_loads_when_present(): void
    {
        AnswerQualityCorpusBuilder::writeJsonFile(base_path(AnswerQualityCorpus::CORPUS_PATH));

        $corpus = AnswerQualityCorpus::load();

        $this->assertSame(1, $corpus['version']);
        $this->assertNotEmpty($corpus['scenarios']);
    }

    #[Test]
    public function profile_from_scenario_uses_persona_employers(): void
    {
        $corpus = AnswerQualityCorpusBuilder::build();
        $scenario = collect($corpus['scenarios'])->firstWhere('id', 'laravel-portfolio-github');

        $this->assertNotNull($scenario);

        $profile = AnswerQualityCorpus::profileFromScenario($corpus, $scenario);

        $this->assertSame('James Mitchell', $profile->full_name);
        $this->assertSame('Riverbank Systems', $profile->experience[0]['company'] ?? null);
    }
}
