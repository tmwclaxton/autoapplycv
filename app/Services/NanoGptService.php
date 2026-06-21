<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

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
     * @param  array<array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $options
     * @return array{content: string, tokens: int}|null
     */
    public function chatWithUsage(array $messages, array $options = []): ?array
    {
        $response = Http::withToken($this->apiKey)
            ->post("{$this->baseUrl}/chat/completions", [
                'model' => $options['model'] ?? $this->defaultModel,
                'messages' => $messages,
                'temperature' => $options['temperature'] ?? 0.3,
                'response_format' => $options['response_format'] ?? null,
            ]);

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
        $result = $this->chatWithUsage($messages, array_merge($options, [
            'response_format' => ['type' => 'json_object'],
        ]));

        if ($result === null) {
            return null;
        }

        $decoded = json_decode($result['content'], true);

        if (! is_array($decoded)) {
            return null;
        }

        $decoded['_tokens_used'] = $result['tokens'];

        return $decoded;
    }

    /**
     * @param  array<array{role: string, content: string}>  $messages
     */
    private function estimateTokens(array $messages): int
    {
        $characters = collect($messages)
            ->pluck('content')
            ->implode('');

        return max(1, (int) ceil(mb_strlen($characters) / 4));
    }
}
