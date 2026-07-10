<?php

namespace Tests\Unit\FormCorpus;

use App\Services\FormCorpusFirecrawlScrutinyService;
use App\Services\NanoGptService;
use Mockery;
use Tests\TestCase;

class ScrutinizeFirecrawlPageCommandTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_scrutinize_command_accepts_real_apply_page(): void
    {
        config(['services.nanogpt.api_key' => 'test-key']);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturn([
                    'accept' => true,
                    'reason' => 'Multi-field job application form with resume upload.',
                    'confidence' => 0.92,
                    'issues' => ['resume upload', 'screening questions'],
                ]);
        });

        $payload = json_encode([
            'url' => 'https://jobs.example.com/apply',
            'page_title' => 'Apply - Example Co',
            'html_excerpt' => '<form><input name="name"><input type="email" name="email"><input type="file" name="resume"></form>',
            'mechanical' => [
                'field_count' => 6,
                'field_types' => ['text', 'email', 'file'],
                'fields' => [],
            ],
            'text_signals' => ['has_form_tag' => true],
        ], JSON_THROW_ON_ERROR);

        $this->artisan('form-corpus:scrutinize-firecrawl-page', [
            '--payload' => $payload,
        ])
            ->assertSuccessful()
            ->expectsOutputToContain('"accept":true');
    }

    public function test_scrutinize_service_maps_model_response(): void
    {
        config(['services.nanogpt.api_key' => 'test-key']);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturn([
                    'accept' => true,
                    'reason' => 'Multi-field job application form with resume upload.',
                    'confidence' => 0.92,
                    'issues' => ['resume upload'],
                ]);
        });

        $result = app(FormCorpusFirecrawlScrutinyService::class)->scrutinize([
            'url' => 'https://jobs.example.com/apply',
            'html_excerpt' => '<form></form>',
            'mechanical' => ['field_count' => 3, 'field_types' => ['text'], 'fields' => []],
        ]);

        $this->assertTrue($result['accept']);
        $this->assertStringContainsString('Multi-field job application form', $result['reason']);
    }

    public function test_scrutinize_command_rejects_blog_template_page(): void
    {
        config(['services.nanogpt.api_key' => 'test-key']);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturn([
                    'accept' => false,
                    'reason' => 'Template gallery article, not an apply form.',
                    'confidence' => 0.88,
                    'issues' => ['blog_or_template'],
                ]);
        });

        $payload = json_encode([
            'url' => 'https://blog.example.com/job-application-form-template',
            'html_excerpt' => '<h1>Free job application form templates</h1><input type="search">',
            'mechanical' => ['field_count' => 2, 'field_types' => ['text'], 'fields' => []],
        ], JSON_THROW_ON_ERROR);

        $this->artisan('form-corpus:scrutinize-firecrawl-page', [
            '--payload' => $payload,
        ])
            ->assertSuccessful()
            ->expectsOutputToContain('"accept":false');
    }

    public function test_scrutinize_command_fails_without_api_key(): void
    {
        config(['services.nanogpt.api_key' => null]);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->artisan('form-corpus:scrutinize-firecrawl-page', [
            '--payload' => json_encode(['url' => 'https://jobs.example.com/apply'], JSON_THROW_ON_ERROR),
        ])
            ->assertFailed()
            ->expectsOutputToContain('NANOGPT_API_KEY is required');
    }

    public function test_service_normalizes_confidence_bounds(): void
    {
        $service = app(FormCorpusFirecrawlScrutinyService::class);

        $normalized = $service->normalizeResult([
            'accept' => true,
            'reason' => 'ok',
            'confidence' => 2.5,
            'issues' => [' ', 'resume'],
        ]);

        $this->assertTrue($normalized['accept']);
        $this->assertSame(1.0, $normalized['confidence']);
        $this->assertSame(['resume'], $normalized['issues']);
    }
}
