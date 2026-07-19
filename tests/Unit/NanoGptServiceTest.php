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

    public function test_chat_with_usage_retries_transient_503_then_succeeds(): void
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

        $this->assertSame('Recovered', $result['content'] ?? null);
        Http::assertSentCount(2);
    }

    public function test_chat_with_usage_throws_unavailable_after_retry_budget_exhausted(): void
    {
        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'error' => ['message' => 'all_fallbacks_failed'],
            ], 503),
        ]);

        try {
            app(NanoGptService::class)->chatWithUsage([
                ['role' => 'user', 'content' => 'Say hi'],
            ]);
            $this->fail('Expected NanoGptRequestException.');
        } catch (NanoGptRequestException $exception) {
            $this->assertSame(503, $exception->statusCode);
            $this->assertSame(NanoGptRequestException::CODE_UNAVAILABLE, $exception->errorCode);
            $this->assertSame(503, $exception->providerStatus);
            $this->assertStringContainsString('temporarily unavailable', $exception->getMessage());
        }

        // Untiered model has no suffix fallbacks, so only same-model retries.
        Http::assertSentCount(3);
    }

    public function test_chat_with_usage_retries_with_throughput_fallback_after_all_fallbacks_failed(): void
    {
        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'all_fallbacks_failed']], 503)
                ->push(['error' => ['message' => 'all_fallbacks_failed']], 503)
                ->push(['error' => ['message' => 'all_fallbacks_failed']], 503)
                ->push([
                    'choices' => [
                        ['message' => ['content' => 'Fallback ok']],
                    ],
                    'usage' => ['total_tokens' => 9],
                    'model' => 'google/gemini-3.1-flash-lite:throughput',
                    'x_nanogpt_pricing' => ['cost' => 0.0021],
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Score this JD'],
        ], [
            'model' => 'google/gemini-3.1-flash-lite:ttfs',
        ]);

        $this->assertSame('Fallback ok', $result['content'] ?? null);
        $this->assertSame(0.0021, $result['credits'] ?? null);
        $this->assertSame('google/gemini-3.1-flash-lite:throughput', $result['model'] ?? null);

        Http::assertSentCount(4);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'google/gemini-3.1-flash-lite:ttfs');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'google/gemini-3.1-flash-lite:throughput');
    }

    public function test_models_with_fallbacks_prefers_tier_then_absolute_config(): void
    {
        config([
            'services.nanogpt.fallback_models' => [':throughput', ':speed'],
            'cv.extraction_model_fallbacks' => [
                'google/gemini-3.1-flash-lite:throughput',
                'deepseek/deepseek-v4-flash:throughput',
            ],
        ]);

        $service = app(NanoGptService::class);
        $method = new \ReflectionMethod(NanoGptService::class, 'modelsWithFallbacks');

        $this->assertSame([
            'google/gemini-3.1-flash-lite:ttfs',
            'google/gemini-3.1-flash-lite:throughput',
            'google/gemini-3.1-flash-lite:speed',
            'deepseek/deepseek-v4-flash:throughput',
        ], $method->invoke($service, 'google/gemini-3.1-flash-lite:ttfs'));

        $this->assertSame([
            'openai/gpt-4.1-mini',
            'google/gemini-3.1-flash-lite:throughput',
            'deepseek/deepseek-v4-flash:throughput',
        ], $method->invoke($service, 'openai/gpt-4.1-mini'));
    }

    public function test_chat_with_usage_uses_absolute_extraction_fallback_after_tier_fallbacks_fail(): void
    {
        config([
            'services.nanogpt.fallback_models' => [':throughput'],
            'services.nanogpt.retry_attempts' => 1,
            'cv.extraction_model_fallbacks' => [
                'deepseek/deepseek-v4-flash:throughput',
            ],
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'all_fallbacks_failed']], 503)
                ->push(['error' => ['message' => 'all_fallbacks_failed']], 503)
                ->push([
                    'choices' => [
                        ['message' => ['content' => 'DeepSeek recovered']],
                    ],
                    'usage' => ['total_tokens' => 11],
                    'model' => 'deepseek/deepseek-v4-flash:throughput',
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Score this JD'],
        ], [
            'model' => 'google/gemini-3.1-flash-lite:ttfs',
        ]);

        $this->assertSame('DeepSeek recovered', $result['content'] ?? null);
        Http::assertSentCount(3);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'google/gemini-3.1-flash-lite:ttfs');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'google/gemini-3.1-flash-lite:throughput');
        Http::assertSent(fn ($request) => $request->data()['model'] === 'deepseek/deepseek-v4-flash:throughput');
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

    public function test_chat_with_usage_throws_timeout_after_connection_failures(): void
    {
        $attempts = 0;

        Http::fake(function () use (&$attempts) {
            $attempts++;

            throw new ConnectionException('cURL error 28: Operation timed out after 45002 milliseconds');
        });

        try {
            app(NanoGptService::class)->chatWithUsage([
                ['role' => 'user', 'content' => 'Say hi'],
            ], [
                'timeout' => 45,
            ]);
            $this->fail('Expected NanoGptRequestException.');
        } catch (NanoGptRequestException $exception) {
            $this->assertSame(504, $exception->statusCode);
            $this->assertSame(NanoGptRequestException::CODE_TIMEOUT, $exception->errorCode);
            $this->assertStringContainsString('timed out after 45s', $exception->getMessage());
        }

        $this->assertSame(3, $attempts);
    }

    public function test_chat_json_retries_transient_503_with_response_format(): void
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

    public function test_chat_json_retries_fallback_model_when_json_is_truncated(): void
    {
        config([
            'services.nanogpt.fallback_models' => [':throughput'],
            'services.nanogpt.retry_attempts' => 1,
            'cv.extraction_model_fallbacks' => [],
        ]);

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::sequence()
                ->push([
                    'choices' => [
                        ['message' => ['content' => '{"full_name": "Toby Claxton", "summary": "Builder at heart with']],
                    ],
                    'usage' => ['total_tokens' => 40],
                    'model' => 'google/gemini-3.1-flash-lite:ttfs',
                ], 200)
                ->push([
                    'choices' => [
                        ['message' => ['content' => '{"full_name":"Toby Claxton","summary":"Complete summary"}']],
                    ],
                    'usage' => ['total_tokens' => 55],
                    'model' => 'google/gemini-3.1-flash-lite:throughput',
                ], 200),
        ]);

        $result = app(NanoGptService::class)->chatJson([
            ['role' => 'user', 'content' => 'Parse CV'],
        ], [
            'model' => 'google/gemini-3.1-flash-lite:ttfs',
            'max_tokens' => 16384,
        ]);

        $this->assertSame('Toby Claxton', $result['full_name'] ?? null);
        $this->assertSame('Complete summary', $result['summary'] ?? null);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'google/gemini-3.1-flash-lite:ttfs'
            && ($request->data()['max_tokens'] ?? null) === 16384);
        Http::assertSent(fn ($request) => $request->data()['model'] === 'google/gemini-3.1-flash-lite:throughput');
    }
}
