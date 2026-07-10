<?php

namespace Tests\Unit\FormCorpus;

use App\Services\FormCorpusInventoryOracleService;
use App\Services\NanoGptService;
use Illuminate\Support\Facades\Artisan;
use Mockery;
use Tests\TestCase;

class InventoryOracleCommandTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_inventory_oracle_command_returns_fields(): void
    {
        config(['services.nanogpt.api_key' => 'test-key']);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturn([
                    'fields' => [
                        [
                            'question' => 'ZZOracleUniqueName',
                            'field_type' => 'text',
                            'required' => true,
                            'options' => null,
                        ],
                        [
                            'question' => 'ZZOracleUniqueMail',
                            'field_type' => 'email',
                            'required' => true,
                            'options' => null,
                        ],
                    ],
                    'notes' => 'Standard contact fields.',
                ]);
        });

        $this->withoutMockingConsoleOutput();

        $exitCode = Artisan::call('form-corpus:inventory-oracle', [
            '--payload' => json_encode([
                'url' => 'https://jobs.example.com/apply',
                'page_title' => 'Apply - Example Co',
                'html_excerpt' => '<form><input name="name"><input type="email" name="email"></form>',
            ], JSON_THROW_ON_ERROR),
        ]);

        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('ZZOracleUniqueName', $output);
        $this->assertStringContainsString('ZZOracleUniqueMail', $output);
    }

    public function test_inventory_oracle_service_extracts_fields(): void
    {
        config(['services.nanogpt.api_key' => 'test-key']);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturn([
                    'fields' => [
                        [
                            'question' => 'Resume',
                            'field_type' => 'file',
                            'required' => false,
                            'options' => null,
                        ],
                    ],
                    'notes' => '',
                ]);
        });

        $result = app(FormCorpusInventoryOracleService::class)->extract([
            'url' => 'https://jobs.example.com/apply',
            'html_excerpt' => '<form><input type="file" name="resume"></form>',
        ]);

        $this->assertCount(1, $result['fields']);
        $this->assertSame('Resume', $result['fields'][0]['question']);
        $this->assertSame('file', $result['fields'][0]['field_type']);
        $this->assertArrayNotHasKey('error', $result);
    }

    public function test_inventory_oracle_fails_on_empty_html(): void
    {
        config(['services.nanogpt.api_key' => 'test-key']);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $result = app(FormCorpusInventoryOracleService::class)->extract([
            'url' => 'https://jobs.example.com/apply',
            'html_excerpt' => '',
        ]);

        $this->assertSame([], $result['fields']);
        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('html_excerpt', $result['error']);
    }

    public function test_inventory_oracle_command_fails_without_api_key(): void
    {
        config(['services.nanogpt.api_key' => null]);

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->artisan('form-corpus:inventory-oracle', [
            '--payload' => json_encode([
                'url' => 'https://jobs.example.com/apply',
                'html_excerpt' => '<form></form>',
            ], JSON_THROW_ON_ERROR),
        ])
            ->assertFailed()
            ->expectsOutputToContain('NANOGPT_API_KEY is required');
    }

    public function test_service_normalizes_field_rows(): void
    {
        $service = app(FormCorpusInventoryOracleService::class);

        $normalized = $service->normalizeResult([
            'fields' => [
                [
                    'question' => ' Gender ',
                    'field_type' => 'SELECT',
                    'required' => 1,
                    'options' => ['Male', ' ', 'Female'],
                ],
                [
                    'question' => '',
                    'field_type' => 'text',
                ],
            ],
            'notes' => 'eeo',
        ], 'test-model');

        $this->assertCount(1, $normalized['fields']);
        $this->assertSame('Gender', $normalized['fields'][0]['question']);
        $this->assertSame('select', $normalized['fields'][0]['field_type']);
        $this->assertTrue($normalized['fields'][0]['required']);
        $this->assertSame(['Male', 'Female'], $normalized['fields'][0]['options']);
        $this->assertSame('eeo', $normalized['notes']);
        $this->assertSame('test-model', $normalized['model']);
    }
}
