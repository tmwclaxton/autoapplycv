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

    public function test_chat_with_usage_reads_credits_from_x_nanogpt_pricing(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hello there.']],
                ],
                'usage' => [
                    'prompt_tokens' => 100,
                    'completion_tokens' => 20,
                    'total_tokens' => 120,
                ],
                'x_nanogpt_pricing' => [
                    'cost' => 0.0034,
                ],
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ]);

        $this->assertSame('Hello there.', $result['content'] ?? null);
        $this->assertSame(120, $result['total_tokens'] ?? null);
        $this->assertSame(0.0034, $result['credits'] ?? null);
    }

    public function test_chat_with_usage_prefers_x_nanogpt_pricing_over_usage_cost(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hello there.']],
                ],
                'usage' => [
                    'total_tokens' => 120,
                    'cost' => 0.0001,
                ],
                'x_nanogpt_pricing' => [
                    'cost' => 0.0034,
                ],
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ]);

        $this->assertSame(0.0034, $result['credits'] ?? null);
    }

    public function test_chat_json_retries_without_response_format_only_when_first_request_fails(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'Service unavailable.']], 503)
                ->push([
                    'choices' => [
                        ['message' => ['content' => '{"full_name":"Alex Developer"}']],
                    ],
                    'usage' => ['total_tokens' => 12],
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatJson([
            ['role' => 'user', 'content' => 'Parse CV'],
        ]);

        $this->assertSame('Alex Developer', $result['full_name'] ?? null);
        Http::assertSentCount(2);
    }

    public function test_chat_json_loose_skips_response_format(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => "```json\n{\"html\":\"<html></html>\",\"title\":\"Apply\"}\n```"]],
                ],
                'usage' => ['total_tokens' => 42],
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatJsonLoose([
            ['role' => 'user', 'content' => 'Generate form HTML'],
        ]);

        $this->assertSame('<html></html>', $result['html'] ?? null);
        $this->assertSame('Apply', $result['title'] ?? null);
        Http::assertSent(fn ($request) => ! array_key_exists('response_format', $request->data()));
    }

    public function test_chat_json_does_not_retry_when_json_decode_fails_but_response_succeeded(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'not valid json at all']],
                ],
                'usage' => ['total_tokens' => 8],
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatJson([
            ['role' => 'user', 'content' => 'Parse CV'],
        ]);

        $this->assertNull($result);
        Http::assertSentCount(1);
    }

    public function test_chat_json_salvages_truncated_answers_payload(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        $truncated = <<<'JSON'
{
  "answers": [
    {
      "label": "please leave a note",
      "ref": "f10",
      "answer": "I have spent my career building products from the ground up
JSON;

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => $truncated]],
                ],
                'usage' => ['total_tokens' => 40],
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatJson([
            ['role' => 'user', 'content' => 'Draft answers'],
        ]);

        $this->assertIsArray($result);
        $this->assertCount(1, $result['answers'] ?? []);
        $this->assertSame('f10', $result['answers'][0]['ref'] ?? null);
        $this->assertStringContainsString('building products', (string) ($result['answers'][0]['answer'] ?? ''));
        Http::assertSent(fn ($request) => ($request->data()['max_tokens'] ?? null) === null);
    }

    public function test_chat_with_usage_forwards_max_tokens(): void
    {
        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => '{"ok":true}']],
                ],
                'usage' => ['total_tokens' => 4],
            ], 200),
        ]);

        app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'hi'],
        ], [
            'max_tokens' => 4096,
        ]);

        Http::assertSent(fn ($request) => ($request->data()['max_tokens'] ?? null) === 4096);
    }
}
