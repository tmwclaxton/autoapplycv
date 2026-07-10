<?php

namespace Tests\Unit\FormCorpus;

use App\Services\FormCorpusAiGeneratorService;
use App\Services\NanoGptService;
use Illuminate\Support\Facades\Process;
use Mockery;
use Tests\TestCase;

class GenerateAiFormCorpusCommandTest extends TestCase
{
    protected function tearDown(): void
    {
        $briefPath = base_path('tests/fixtures/form-extraction/briefs/syn-ai-0001.json');

        if (is_file($briefPath)) {
            unlink($briefPath);
        }

        Mockery::close();
        parent::tearDown();
    }

    public function test_generate_ai_dry_run_composes_briefs_without_nanogpt(): void
    {
        Process::fake([
            '*' => Process::result(output: json_encode([
                'id' => 'syn-ai-0001',
                'seed' => 123,
                'variety' => [
                    'ats_style' => 'ashby',
                    'widgets' => ['combobox'],
                    'structure' => 'single-page',
                    'field_count_band' => 'medium',
                ],
                'constraints' => [
                    'min_fields' => 12,
                    'min_field_types' => 4,
                    'weirdness' => ['Label split across spans'],
                ],
                'prompt_summary' => 'Test brief',
            ], JSON_THROW_ON_ERROR)),
        ]);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->artisan('form-corpus:generate-ai', [
            '--id' => 'syn-ai-0001',
            '--dry-run' => true,
        ])->assertSuccessful();

        $this->assertFileExists(base_path('tests/fixtures/form-extraction/briefs/syn-ai-0001.json'));
    }

    public function test_generator_resolves_id_batch(): void
    {
        $service = app(FormCorpusAiGeneratorService::class);

        $this->assertSame(
            ['syn-ai-0001', 'syn-ai-0002', 'syn-ai-0003'],
            $service->resolveIdBatch('syn-ai-0001', 3),
        );
    }

    public function test_form_corpus_ai_model_uses_deepseek_default(): void
    {
        $this->assertSame('deepseek/deepseek-v4-flash', config('cv.form_corpus_ai_model'));
        $this->assertSame('deepseek/deepseek-v4-flash', app(FormCorpusAiGeneratorService::class)->model());
    }
}
