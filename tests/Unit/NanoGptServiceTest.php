<?php

namespace Tests\Unit;

use App\Exceptions\NanoGptRequestException;
use App\Services\NanoGptService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NanoGptServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
            'services.nanogpt.timeout' => 45,
            'services.nanogpt.connect_timeout' => 8,
            'services.nanogpt.retry_attempts' => 3,
            'services.nanogpt.retry_delay_ms' => [0, 0],
            'services.nanogpt.fallback_models' => [':throughput', ':speed'],
            'cv.extraction_model_fallbacks' => [],
        ]);
    }

    public function test_chat_with_usage_falls_back_to_base_model_when_fast_tier_is_rejected(): void
    {
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

    public function test_chat_with_usage_returns_null_on_transient_503(): void
    {
        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'all_fallbacks_failed']], 503)
                ->push([
                    'choices' => [
                        ['message' => ['content' => 'Recovered']],
                    ],
                    'usage' => ['total_tokens' => 8],
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ]);

        $this->assertNull($result);
        Http::assertSentCount(1);
    }

    public function test_chat_with_usage_returns_null_when_provider_is_unavailable(): void
    {
        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'error' => ['message' => 'all_fallbacks_failed'],
            ], 503),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ]);

        $this->assertNull($result);
        Http::assertSentCount(1);
    }

    public function test_model_candidates_prefers_requested_tier_then_base_and_alternate_tiers(): void
    {
        $service = app(NanoGptService::class);
        $method = new \ReflectionMethod(NanoGptService::class, 'modelCandidates');

        $this->assertSame([
            'google/gemini-3.1-flash-lite:ttfs',
            'google/gemini-3.1-flash-lite',
            'google/gemini-3.1-flash-lite:throughput',
            'google/gemini-3.1-flash-lite:speed',
            'google/gemini-3.1-flash-lite:fast',
        ], $method->invoke($service, 'google/gemini-3.1-flash-lite:ttfs'));

        $this->assertSame([
            'openai/gpt-4.1-mini',
        ], $method->invoke($service, 'openai/gpt-4.1-mini'));
    }

    public function test_nanogpt_request_exception_accepts_null_message(): void
    {
        $exception = new NanoGptRequestException(
            message: null,
            statusCode: 503,
            errorCode: NanoGptRequestException::CODE_UNAVAILABLE,
        );

        $this->assertSame('AI request failed. Please try again shortly.', $exception->getMessage());
    }

    public function test_chat_with_usage_returns_null_after_connection_failure(): void
    {
        $attempts = 0;

        Http::fake(function () use (&$attempts) {
            $attempts++;

            throw new ConnectionException('cURL error 28: Operation timed out after 45002 milliseconds');
        });

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ], [
            'timeout' => 45,
        ]);

        $this->assertNull($result);
        $this->assertSame(1, $attempts);
    }

    public function test_chat_json_retries_without_response_format_after_503(): void
    {
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
        Http::assertSent(fn ($request) => ($request->data()['response_format']['type'] ?? null) === 'json_object');
        Http::assertSent(fn ($request) => ! array_key_exists('response_format', $request->data()));
    }

    public function test_chat_json_loose_skips_response_format(): void
    {
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

    public function test_chat_json_returns_null_when_json_decode_fails_without_fallbacks(): void
    {
        config([
            'services.nanogpt.fallback_models' => [],
            'cv.extraction_model_fallbacks' => [],
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
        ], [
            'model' => 'openai/gpt-4.1-mini',
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

    public function test_chat_json_returns_null_when_json_is_truncated(): void
    {
        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => '{"full_name": "Toby Claxton", "summary": "Builder at heart with']],
                ],
                'usage' => ['total_tokens' => 40],
                'model' => 'google/gemini-3.1-flash-lite:ttfs',
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatJson([
            ['role' => 'user', 'content' => 'Parse CV'],
        ], [
            'model' => 'google/gemini-3.1-flash-lite:ttfs',
            'max_tokens' => 16384,
        ]);

        $this->assertNull($result);
        Http::assertSentCount(1);
    }
}
