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
     */
    public function chat(array $messages, array $options = []): ?string
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

        return $response->json('choices.0.message.content');
    }

    /**
     * @return array<string, mixed>|null
     */
    public function chatJson(array $messages, array $options = []): ?array
    {
        $content = $this->chat($messages, array_merge($options, [
            'response_format' => ['type' => 'json_object'],
        ]));

        if ($content === null) {
            return null;
        }

        $decoded = json_decode($content, true);

        return is_array($decoded) ? $decoded : null;
    }
}
