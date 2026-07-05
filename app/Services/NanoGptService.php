<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class NanoGptService
{
    private string $apiKey;

    private string $baseUrl;

    private string $defaultModel = 'openai/gpt-4.1-mini';

    public function __construct()
    {
        $this->apiKey = config('services.nanogpt.api_key');
        $this->baseUrl = config('services.nanogpt.base_url', 'https://nano-gpt.com/api/v1');
    }

    /**
     * @param  array<array{role: string, content: string|array<int, mixed>}>  $messages
     * @param  callable(string): void  $onDelta
     * @param  array<string, mixed>  $options
     */
    public function chatStream(array $messages, callable $onDelta, array $options = []): ?string
    {
        $timeout = (int) ($options['timeout'] ?? config('services.nanogpt.timeout', 120));
        $connectTimeout = (int) ($options['connect_timeout'] ?? config('services.nanogpt.connect_timeout', 15));

        try {
            $response = $this->postChatCompletions(
                messages: $messages,
                options: $options,
                timeout: $timeout,
                connectTimeout: $connectTimeout,
                stream: true,
            );
        } catch (ConnectionException $exception) {
            Log::error('NanoGPT stream connection error', [
                'message' => $exception->getMessage(),
            ]);

            return null;
        } catch (Throwable $exception) {
            Log::error('NanoGPT stream request failed', [
                'message' => $exception->getMessage(),
            ]);

            return null;
        }

        if (! $response->successful()) {
            Log::error('NanoGPT stream API error', [
                'status' => $response->status(),
                'body' => $response->body(),
                'model' => (string) ($options['model'] ?? $this->defaultModel),
            ]);

            return null;
        }

        $body = $response->toPsrResponse()->getBody();
        $content = '';

        while (! $body->eof()) {
            $line = $this->readStreamLine($body);

            if ($line === null || $line === '') {
                continue;
            }

            if (! str_starts_with($line, 'data: ')) {
                continue;
            }

            $payload = trim(substr($line, 6));

            if ($payload === '' || $payload === '[DONE]') {
                continue;
            }

            $decoded = json_decode($payload, true);

            if (! is_array($decoded)) {
                continue;
            }

            $delta = $decoded['choices'][0]['delta']['content'] ?? null;

            if (! is_string($delta) || $delta === '') {
                continue;
            }

            $content .= $delta;
            $onDelta($delta);
        }

        return trim($content) !== '' ? $content : null;
    }

    /**
     * @param  resource  $body
     */
    private function readStreamLine($body): ?string
    {
        $line = '';

        while (! $body->eof()) {
            $chunk = $body->read(1);

            if ($chunk === '') {
                break;
            }

            if ($chunk === "\n") {
                break;
            }

            $line .= $chunk;
        }

        if ($line === '') {
            return null;
        }

        return rtrim($line, "\r");
    }

    /**
     * @param  array<array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $options
     * @return array{
     *     content: string,
     *     prompt_tokens: int,
     *     completion_tokens: int,
     *     total_tokens: int,
     *     credits: float|null,
     *     model: string,
     * }|null
     */
    public function chatWithUsage(array $messages, array $options = []): ?array
    {
        $timeout = (int) ($options['timeout'] ?? config('services.nanogpt.timeout', 120));
        $connectTimeout = (int) ($options['connect_timeout'] ?? config('services.nanogpt.connect_timeout', 15));
        $requestedModel = (string) ($options['model'] ?? $this->defaultModel);

        try {
            $response = $this->postChatCompletions(
                messages: $messages,
                options: $options,
                timeout: $timeout,
                connectTimeout: $connectTimeout,
                stream: false,
            );
        } catch (ConnectionException $exception) {
            Log::error('NanoGPT connection error', [
                'message' => $exception->getMessage(),
                'timeout' => $timeout,
            ]);

            return null;
        } catch (Throwable $exception) {
            Log::error('NanoGPT request failed', [
                'message' => $exception->getMessage(),
            ]);

            return null;
        }

        if (! $response->successful()) {
            Log::error('NanoGPT API error', [
                'status' => $response->status(),
                'body' => $response->body(),
                'model' => $requestedModel,
            ]);

            return null;
        }

        $usage = $response->json('usage');
        $estimatedTokens = $this->estimateTokens($messages);
        $totalTokens = max(1, (int) ($usage['total_tokens'] ?? $estimatedTokens));
        $promptTokens = max(0, (int) ($usage['prompt_tokens'] ?? $totalTokens));
        $completionTokens = max(0, (int) ($usage['completion_tokens'] ?? max(0, $totalTokens - $promptTokens)));
        $credits = $usage['cost'] ?? $usage['credits'] ?? $usage['nano_credits'] ?? null;
        $content = $response->json('choices.0.message.content');
        $model = (string) ($response->json('model') ?? $requestedModel);

        if (! is_string($content)) {
            return null;
        }

        return [
            'content' => $content,
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens,
            'total_tokens' => $totalTokens,
            'credits' => is_numeric($credits) ? (float) $credits : null,
            'model' => $model,
        ];
    }

    /**
     * @param  array<array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $options
     */
    public function chat(array $messages, array $options = []): ?string
    {
        return $this->chatWithUsage($messages, $options)['content'] ?? null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function chatJson(array $messages, array $options = []): ?array
    {
        $withJsonFormat = $this->decodeChatJsonResponse(
            $this->chatWithUsage($messages, array_merge($options, [
                'response_format' => ['type' => 'json_object'],
            ]))
        );

        if ($withJsonFormat !== null) {
            return $withJsonFormat;
        }

        return $this->decodeChatJsonResponse(
            $this->chatWithUsage($messages, $options)
        );
    }

    /**
     * @param  array{
     *     content: string,
     *     prompt_tokens: int,
     *     completion_tokens: int,
     *     total_tokens: int,
     *     credits: float|null,
     *     model: string,
     * }|null  $result
     * @return array<string, mixed>|null
     */
    private function decodeChatJsonResponse(?array $result): ?array
    {
        if ($result === null) {
            return null;
        }

        $decoded = $this->decodeJsonContent($result['content']);

        if (! is_array($decoded)) {
            Log::warning('NanoGPT returned non-JSON content', [
                'preview' => mb_substr($result['content'], 0, 500),
            ]);

            return null;
        }

        $decoded['_usage'] = [
            'prompt_tokens' => $result['prompt_tokens'],
            'completion_tokens' => $result['completion_tokens'],
            'total_tokens' => $result['total_tokens'],
            'credits' => $result['credits'],
            'model' => $result['model'],
        ];

        return $decoded;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeJsonContent(string $content): ?array
    {
        $content = trim($content);

        if ($content === '') {
            return null;
        }

        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/i', $content, $matches)) {
            $content = trim($matches[1]);
        }

        $decoded = json_decode($content, true);

        if (is_array($decoded)) {
            return $decoded;
        }

        $start = strpos($content, '{');
        $end = strrpos($content, '}');

        if ($start === false || $end === false || $end <= $start) {
            return null;
        }

        $decoded = json_decode(substr($content, $start, $end - $start + 1), true);

        return is_array($decoded) ? $decoded : null;
    }

    public function extractTextFromImage(string $absolutePath, string $mimeType): ?string
    {
        if (! is_readable($absolutePath)) {
            return null;
        }

        $contents = file_get_contents($absolutePath);

        if ($contents === false) {
            return null;
        }

        $base64 = base64_encode($contents);
        $dataUri = "data:{$mimeType};base64,{$base64}";

        $result = $this->chatWithUsage([
            [
                'role' => 'system',
                'content' => 'You extract text from CV/resume images. Return plain text only with line breaks preserving structure. Include every word visible. Do not summarize or add commentary.',
            ],
            [
                'role' => 'user',
                'content' => [
                    [
                        'type' => 'text',
                        'text' => 'Extract all text from this CV/resume image verbatim.',
                    ],
                    [
                        'type' => 'image_url',
                        'image_url' => [
                            'url' => $dataUri,
                        ],
                    ],
                ],
            ],
        ], [
            'model' => config('cv.vision_model'),
            'temperature' => 0,
            'timeout' => (int) config('cv.vision_timeout', 120),
        ]);

        $content = $result['content'] ?? null;

        return is_string($content) ? trim($content) : null;
    }

    /**
     * @param  array<array{role: string, content: string|array<int, mixed>}>  $messages
     * @param  array<string, mixed>  $options
     */
    private function postChatCompletions(
        array $messages,
        array $options,
        int $timeout,
        int $connectTimeout,
        bool $stream,
    ): Response {
        $model = (string) ($options['model'] ?? $this->defaultModel);
        $payload = [
            'messages' => $messages,
            'temperature' => $options['temperature'] ?? 0.3,
        ];

        if ($stream) {
            $payload['stream'] = true;
        }

        if (array_key_exists('response_format', $options) && $options['response_format'] !== null) {
            $payload['response_format'] = $options['response_format'];
        }

        $request = Http::withToken($this->apiKey)
            ->connectTimeout($connectTimeout)
            ->timeout($timeout);

        if ($stream) {
            $request = $request->withOptions(['stream' => true]);
        }

        $response = null;

        foreach ($this->modelCandidates($model) as $candidate) {
            $payload['model'] = $candidate;
            $response = $request->post("{$this->baseUrl}/chat/completions", $payload);

            if ($response->successful() || $response->status() !== 400) {
                if ($candidate !== $model && ! $response->successful()) {
                    Log::warning('NanoGPT chat completion fell back to alternate model tier.', [
                        'requested_model' => $model,
                        'attempted_model' => $candidate,
                        'stream' => $stream,
                        'status' => $response->status(),
                    ]);
                }

                return $response;
            }

            Log::warning('NanoGPT chat completion rejected model tier, trying fallback.', [
                'requested_model' => $model,
                'attempted_model' => $candidate,
                'stream' => $stream,
            ]);
        }

        return $response ?? $request->post("{$this->baseUrl}/chat/completions", array_merge($payload, [
            'model' => $model,
        ]));
    }

    /**
     * @return list<string>
     */
    private function modelCandidates(string $model): array
    {
        $suffixes = [':throughput', ':speed', ':ttfs', ':fast'];
        $base = $model;
        $activeSuffix = null;

        foreach ($suffixes as $suffix) {
            if (! str_ends_with($model, $suffix)) {
                continue;
            }

            $base = substr($model, 0, -strlen($suffix));
            $activeSuffix = $suffix;

            break;
        }

        if ($activeSuffix === null) {
            return [$model];
        }

        $candidates = [$model, $base];

        foreach ($suffixes as $suffix) {
            if ($suffix === $activeSuffix) {
                continue;
            }

            $candidates[] = $base.$suffix;
        }

        return array_values(array_unique($candidates));
    }

    /**
     * @param  array<array{role: string, content: string|array<int, mixed>}>  $messages
     */
    private function estimateTokens(array $messages): int
    {
        $characters = collect($messages)
            ->map(function (array $message): string {
                $content = $message['content'];

                if (is_string($content)) {
                    return $content;
                }

                if (! is_array($content)) {
                    return '';
                }

                return collect($content)
                    ->map(function (mixed $part): string {
                        if (is_string($part)) {
                            return $part;
                        }

                        if (! is_array($part)) {
                            return '';
                        }

                        return is_string($part['text'] ?? null) ? $part['text'] : '';
                    })
                    ->implode('');
            })
            ->implode('');

        return max(1, (int) ceil(mb_strlen($characters) / 4));
    }
}
