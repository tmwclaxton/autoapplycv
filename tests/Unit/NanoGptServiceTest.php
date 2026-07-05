<?php

namespace Tests\Unit;

use App\Services\NanoGptService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NanoGptServiceTest extends TestCase
{
    public function test_chat_with_usage_falls_back_to_base_model_when_fast_tier_is_rejected(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'Invalid request parameters.']], 400)
                ->push([
                    'choices' => [
                        ['message' => ['content' => '{"full_name":"Alex Developer"}']],
                    ],
                    'usage' => ['total_tokens' => 12],
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Parse CV'],
        ], [
            'model' => 'qwen3.7-max:fast',
        ]);

        $this->assertSame('{"full_name":"Alex Developer"}', $result['content'] ?? null);

        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'qwen3.7-max:fast');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'qwen3.7-max');
    }

    public function test_chat_with_usage_falls_back_to_base_model_when_speed_tier_is_rejected(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'Invalid request parameters.']], 400)
                ->push([
                    'choices' => [
                        ['message' => ['content' => 'Hello there.']],
                    ],
                    'usage' => ['total_tokens' => 12],
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ], [
            'model' => 'example/example-v1:speed',
        ]);

        $this->assertSame('Hello there.', $result['content'] ?? null);

        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'example/example-v1:speed');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'example/example-v1');
    }

    public function test_chat_with_usage_falls_back_from_rejected_speed_to_throughput_for_deepseek(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'Invalid request parameters.']], 400)
                ->push(['error' => ['message' => 'Invalid request parameters.']], 400)
                ->push([
                    'choices' => [
                        ['message' => ['content' => 'Hi']],
                    ],
                    'usage' => ['total_tokens' => 5],
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ], [
            'model' => 'deepseek/deepseek-v4-flash:speed',
        ]);

        $this->assertSame('Hi', $result['content'] ?? null);

        Http::assertSentCount(3);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'deepseek/deepseek-v4-flash:speed');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'deepseek/deepseek-v4-flash');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'deepseek/deepseek-v4-flash:throughput');
    }

    public function test_chat_with_usage_uses_throughput_tier_when_accepted(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hi']],
                ],
                'usage' => ['total_tokens' => 5],
            ], 200),
        ]);

        app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ], [
            'model' => 'deepseek/deepseek-v4-flash:throughput',
        ]);

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'deepseek/deepseek-v4-flash:throughput');
    }
}
