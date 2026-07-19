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

        return self::filterAllowedSources($sources);
    }

    /**
     * Drop competitor Chrome Web Store listings and other disallowed research URLs.
     *
     * @param  array<int, array{title: string, url: string, description: string}>  $sources
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public static function filterAllowedSources(array $sources): array
    {
        $kept = [];
        foreach ($sources as $source) {
            if (! self::isAllowedSourceUrl($source['url'])) {
                continue;
            }
            $kept[] = $source;
        }

        return array_values($kept);
    }

    public static function isAllowedSourceUrl(string $url): bool
    {
        $url = trim($url);
        if ($url === '' || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return false;
        }

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        if (self::isChromeWebStoreHost($host)) {
            return self::isOfficialChromeWebStoreUrl($url, $path);
        }

        return true;
    }

    public static function isOfficialChromeWebStoreUrl(string $url, ?string $path = null): bool
    {
        $path ??= strtolower((string) parse_url($url, PHP_URL_PATH));
        $officialId = strtolower((string) config(
            'blog.sources.official_chrome_extension_id',
            'mldeodhhcbnhnjklmelneecjpjkjemih',
        ));
        $officialSlug = strtolower((string) config(
            'blog.sources.official_chrome_web_store_slug',
            'autocvapply',
        ));

        if ($officialId !== '' && str_contains($path, '/'.$officialId)) {
            return true;
        }

        if ($officialSlug !== '' && preg_match('#/detail/'.preg_quote($officialSlug, '#').'(/|$)#', $path) === 1) {
            return true;
        }

        return false;
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

        $officialStore = (string) config(
            'blog.sources.official_chrome_web_store_url',
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        );

        $lines = ['## Web research (Firecrawl search results)', ''];
        $lines[] = 'Ground factual claims about the job market, ATS tools, or third-party products in these sources when relevant.';
        $lines[] = 'Do not invent URLs. Prefer citing these sources. AutoCVApply product facts still come only from the authoritative context below.';
        $lines[] = 'Never treat competitor autofill / Easy Apply Chrome extensions as AutoCVApply, as product references, or as Sources.';
        $lines[] = 'Only Chrome Web Store URL allowed for the product is the official AutoCVApply listing: '.$officialStore;
        $lines[] = 'Prefer autocvapply.com, that official store listing, LinkedIn/Indeed/job-board docs, and reputable career guides.';
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
     * Keep plan sources whose URLs appear in the filtered research set, then rank to a quality shortlist.
     * Falls back to ranked research when the model invents URLs or returns none.
     *
     * @param  array<int, array{title: string, url: string, description: string}>  $researchSources
     * @param  array<int, mixed>  $planSources
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public static function selectSourcesForArticle(array $researchSources, array $planSources): array
    {
        $researchSources = self::filterAllowedSources($researchSources);
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
            if ($url === '' || ! self::isAllowedSourceUrl($url)) {
                continue;
            }
            $key = strtolower($url);
            if (! isset($byUrl[$key])) {
                continue;
            }
            $selected[] = $byUrl[$key];
            unset($byUrl[$key]);
        }

        $pool = $selected !== [] ? array_values($selected) : $researchSources;

        return self::rankSourcesForArticle($pool);
    }

    /**
     * Prefer first-party and reputable hosts; keep a diverse shortlist of about 3-5 sources.
     *
     * @param  array<int, array{title: string, url: string, description: string}>  $sources
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public static function rankSourcesForArticle(array $sources): array
    {
        $sources = self::filterAllowedSources($sources);
        if ($sources === []) {
            return [];
        }

        $min = max(1, (int) config('blog.sources.target_min', 3));
        $max = max($min, (int) config('blog.sources.target_max', 5));

        usort($sources, function (array $a, array $b): int {
            $scoreDiff = self::sourcePreferenceScore($b['url']) <=> self::sourcePreferenceScore($a['url']);
            if ($scoreDiff !== 0) {
                return $scoreDiff;
            }

            return strcmp($a['url'], $b['url']);
        });

        $picked = [];
        $seenHosts = [];

        foreach ($sources as $source) {
            if (count($picked) >= $max) {
                break;
            }
            $host = self::registrableHost($source['url']);
            if ($host !== '' && isset($seenHosts[$host]) && count($picked) >= $min) {
                continue;
            }
            $picked[] = $source;
            if ($host !== '') {
                $seenHosts[$host] = true;
            }
        }

        if (count($picked) < $min) {
            foreach ($sources as $source) {
                if (count($picked) >= $min) {
                    break;
                }
                $already = false;
                foreach ($picked as $existing) {
                    if (strcasecmp($existing['url'], $source['url']) === 0) {
                        $already = true;
                        break;
                    }
                }
                if (! $already) {
                    $picked[] = $source;
                }
            }
        }

        return array_values($picked);
    }

    public static function sourcePreferenceScore(string $url): int
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        if (self::hostMatchesSuffix($host, 'autocvapply.com')) {
            return 100;
        }

        if (self::isChromeWebStoreHost($host) && self::isOfficialChromeWebStoreUrl($url, $path)) {
            return 95;
        }

        $preferred = config('blog.sources.preferred_host_suffixes', []);
        if (is_array($preferred)) {
            foreach ($preferred as $index => $suffix) {
                if (! is_string($suffix) || $suffix === '') {
                    continue;
                }
                if (self::hostMatchesSuffix($host, $suffix)) {
                    return 80 - min(20, (int) $index);
                }
            }
        }

        return 10;
    }

    protected static function isChromeWebStoreHost(string $host): bool
    {
        return $host === 'chromewebstore.google.com'
            || $host === 'chrome.google.com'
            || str_ends_with($host, '.chromewebstore.google.com');
    }

    protected static function hostMatchesSuffix(string $host, string $suffix): bool
    {
        $host = strtolower($host);
        $suffix = strtolower(ltrim($suffix, '.'));

        return $host === $suffix || str_ends_with($host, '.'.$suffix);
    }

    protected static function registrableHost(string $url): string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '') {
            return '';
        }

        $parts = explode('.', $host);
        if (count($parts) >= 2) {
            return $parts[count($parts) - 2].'.'.$parts[count($parts) - 1];
        }

        return $host;
    }
}
