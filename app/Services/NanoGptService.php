<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
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
     * @param  array<string, mixed>  $options
     * @return array{content: string, tokens: int}|null
     */
    public function chatWithUsage(array $messages, array $options = []): ?array
    {
        $timeout = (int) ($options['timeout'] ?? config('services.nanogpt.timeout', 120));
        $connectTimeout = (int) ($options['connect_timeout'] ?? config('services.nanogpt.connect_timeout', 15));

        try {
            $response = Http::withToken($this->apiKey)
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->post("{$this->baseUrl}/chat/completions", [
                    'model' => $options['model'] ?? $this->defaultModel,
                    'messages' => $messages,
                    'temperature' => $options['temperature'] ?? 0.3,
                    'response_format' => $options['response_format'] ?? null,
                ]);
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
            ]);

            return null;
        }

        $usage = $response->json('usage');
        $tokens = (int) ($usage['total_tokens'] ?? $this->estimateTokens($messages));
        $content = $response->json('choices.0.message.content');

        if (! is_string($content)) {
            return null;
        }

        return [
            'content' => $content,
            'tokens' => max(1, $tokens),
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
     * @param  array{content: string, tokens: int}|null  $result
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

        $decoded['_tokens_used'] = $result['tokens'];

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
