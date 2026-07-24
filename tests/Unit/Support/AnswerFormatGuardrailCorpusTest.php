<?php

namespace Tests\Unit\Support;

use App\Support\AnswerFormatGuardrailCorpus;
use App\Support\AnswerFormatGuardrailCorpusBuilder;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerFormatGuardrailCorpusTest extends TestCase
{
    #[Test]
    public function built_corpus_has_at_least_one_thousand_unique_curated_scenarios(): void
    {
        $corpus = AnswerFormatGuardrailCorpusBuilder::build();

        AnswerFormatGuardrailCorpus::validate($corpus);

        $this->assertGreaterThanOrEqual(1000, count($corpus['scenarios']));
        $this->assertSame(AnswerFormatGuardrailCorpus::PERSONA_KEY, $corpus['persona_key']);
        $this->assertSame('James Mitchell', $corpus['profile_persona']['full_name'] ?? null);

        $ids = array_column($corpus['scenarios'], 'id');
        $this->assertSame(count($ids), count(array_unique($ids)));

        $labels = array_map(static fn (string $label): string => mb_strtolower(trim($label)), array_column($corpus['scenarios'], 'label'));
        $this->assertSame(count($labels), count(array_unique($labels)));

        $shapes = array_unique(array_column($corpus['scenarios'], 'answer_shape'));
        foreach (['yes_no', 'digit', 'currency', 'url', 'email', 'phone', 'one_liner', 'short_paragraph', 'long_paragraph', 'select_option'] as $required) {
            $this->assertContains($required, $shapes);
        }
    }

    #[Test]
    public function corpus_json_loads_when_written(): void
    {
        AnswerFormatGuardrailCorpusBuilder::writeJsonFile(base_path(AnswerFormatGuardrailCorpus::CORPUS_PATH));

        $corpus = AnswerFormatGuardrailCorpus::load();

        $this->assertSame(1, $corpus['version']);
        $this->assertGreaterThanOrEqual(1000, count($corpus['scenarios']));
    }

    #[Test]
    public function profile_includes_enriched_persona_fields(): void
    {
        $corpus = AnswerFormatGuardrailCorpusBuilder::build();
        $profile = AnswerFormatGuardrailCorpus::profile($corpus);

        $this->assertSame('James Mitchell', $profile->full_name);
        $this->assertNotEmpty($profile->linkedin_url);
        $this->assertSame('65000', $profile->application_settings['expected_salary_yearly'] ?? null);
    }
}
