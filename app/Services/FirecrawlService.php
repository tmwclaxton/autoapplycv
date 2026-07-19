<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class FirecrawlService
{
    private ?string $apiKey;

    private string $baseUrl;

    private int $timeout;

    public function __construct()
    {
        $key = config('services.firecrawl.api_key');
        $this->apiKey = is_string($key) && trim($key) !== '' ? trim($key) : null;
        $this->baseUrl = rtrim((string) config('services.firecrawl.base_url', 'https://api.firecrawl.dev/v1'), '/');
        $this->timeout = max(5, (int) config('services.firecrawl.timeout', 120));
    }

    public function isConfigured(): bool
    {
        return $this->apiKey !== null;
    }

    /**
     * Search the web via Firecrawl.
     *
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public function search(string $query, int $limit = 8): array
    {
        $query = trim($query);
        if ($query === '') {
            return [];
        }

        if (! $this->isConfigured()) {
            Log::warning('Firecrawl search skipped: API key not configured.');

            return [];
        }

        $limit = max(1, min($limit, 25));

        try {
            $response = Http::withToken($this->apiKey)
                ->acceptJson()
                ->timeout($this->timeout)
                ->post($this->baseUrl.'/search', [
                    'query' => $query,
                    'limit' => $limit,
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Firecrawl search connection failed.', [
                'query' => $query,
                'message' => $e->getMessage(),
            ]);

            return [];
        } catch (Throwable $e) {
            Log::warning('Firecrawl search request failed.', [
                'query' => $query,
                'message' => $e->getMessage(),
            ]);

            return [];
        }

        if (! $response->successful()) {
            Log::warning('Firecrawl search HTTP error.', [
                'query' => $query,
                'status' => $response->status(),
                'body' => mb_substr($response->body(), 0, 500),
            ]);

            return [];
        }

        $payload = $response->json();
        if (! is_array($payload) || ($payload['success'] ?? true) === false) {
            Log::warning('Firecrawl search returned unsuccessful payload.', [
                'query' => $query,
                'error' => is_array($payload) ? ($payload['error'] ?? $payload['message'] ?? null) : null,
            ]);

            return [];
        }

        $rows = $payload['data'] ?? $payload['web'] ?? [];
        if (! is_array($rows)) {
            return [];
        }

        return self::normalizeSearchResults($rows);
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public static function normalizeSearchResults(array $rows): array
    {
        $sources = [];
        $seenUrls = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $url = trim((string) ($row['url'] ?? $row['link'] ?? ''));
            if ($url === '' || ! filter_var($url, FILTER_VALIDATE_URL)) {
                continue;
            }

            $urlKey = strtolower($url);
            if (isset($seenUrls[$urlKey])) {
                continue;
            }
            $seenUrls[$urlKey] = true;

            $title = trim((string) ($row['title'] ?? ''));
            if ($title === '') {
                $title = $url;
            }

            $description = trim((string) (
                $row['description']
                ?? $row['snippet']
                ?? $row['markdown']
                ?? ''
            ));
            if (mb_strlen($description) > 400) {
                $description = mb_substr($description, 0, 397).'...';
            }

            $sources[] = [
                'title' => $title,
                'url' => $url,
                'description' => $description,
            ];
        }

        return $sources;
    }

    /**
     * Format research sources for inclusion in NanoGPT prompts.
     *
     * @param  array<int, array{title: string, url: string, description: string}>  $sources
     */
    public static function formatSourcesForPrompt(array $sources): string
    {
        if ($sources === []) {
            return '';
        }

        $lines = ['## Web research (Firecrawl search results)', ''];
        $lines[] = 'Ground factual claims about the job market, ATS tools, or third-party products in these sources when relevant.';
        $lines[] = 'Do not invent URLs. Prefer citing these sources. AutoCVApply product facts still come only from the authoritative context below.';
        $lines[] = '';

        foreach ($sources as $index => $source) {
            $n = $index + 1;
            $title = $source['title'];
            $url = $source['url'];
            $description = $source['description'] !== '' ? $source['description'] : '(no snippet)';
            $lines[] = "{$n}. {$title}";
            $lines[] = "   URL: {$url}";
            $lines[] = "   Snippet: {$description}";
            $lines[] = '';
        }

        return rtrim(implode("\n", $lines));
    }

    /**
     * Keep only plan sources whose URLs appear in the research set (exact match, case-insensitive).
     * Falls back to the full research set when the model invents URLs or returns none.
     *
     * @param  array<int, array{title: string, url: string, description: string}>  $researchSources
     * @param  array<int, mixed>  $planSources
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public static function selectSourcesForArticle(array $researchSources, array $planSources): array
    {
        if ($researchSources === []) {
            return [];
        }

        $byUrl = [];
        foreach ($researchSources as $source) {
            $byUrl[strtolower($source['url'])] = $source;
        }

        $selected = [];
        foreach ($planSources as $planSource) {
            if (! is_array($planSource)) {
                continue;
            }
            $url = trim((string) ($planSource['url'] ?? ''));
            if ($url === '') {
                continue;
            }
            $key = strtolower($url);
            if (! isset($byUrl[$key])) {
                continue;
            }
            $selected[] = $byUrl[$key];
            unset($byUrl[$key]);
        }

        return $selected !== [] ? array_values($selected) : $researchSources;
    }
}
