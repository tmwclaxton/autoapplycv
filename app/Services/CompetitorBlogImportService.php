<?php

namespace App\Services;

use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogKeywordStrategy;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class CompetitorBlogImportService
{
    public function __construct(
        private readonly FirecrawlService $firecrawl,
        private readonly NanoGptService $nanoGpt,
    ) {}

    public function manifestDisk(): string
    {
        return (string) config('blog.import.manifest_disk', 'local');
    }

    public function manifestPath(): string
    {
        return (string) config('blog.import.manifest_path', 'blog-imports/competitor-manifest.json');
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function configuredSources(?string $onlySourceId = null): array
    {
        $raw = config('blog.import.sources', []);
        if (! is_array($raw)) {
            return [];
        }

        $sources = [];
        foreach ($raw as $source) {
            if (! is_array($source)) {
                continue;
            }
            $id = trim((string) ($source['id'] ?? ''));
            if ($id === '') {
                continue;
            }
            if (($source['enabled'] ?? true) !== true) {
                continue;
            }
            if ($onlySourceId !== null && $onlySourceId !== '' && $id !== $onlySourceId) {
                continue;
            }
            $sources[] = $source;
        }

        return $sources;
    }

    /**
     * @return array{version: int, updated_at: string|null, sources: array<string, mixed>, entries: array<string, array<string, mixed>>}
     */
    public function loadManifest(): array
    {
        $disk = Storage::disk($this->manifestDisk());
        $path = $this->manifestPath();

        if (! $disk->exists($path)) {
            return $this->emptyManifest();
        }

        try {
            $decoded = json_decode($disk->get($path) ?: '{}', true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            Log::warning('Competitor blog import manifest corrupt; starting fresh.', [
                'path' => $path,
                'message' => $e->getMessage(),
            ]);

            return $this->emptyManifest();
        }

        if (! is_array($decoded)) {
            return $this->emptyManifest();
        }

        $entries = $decoded['entries'] ?? [];
        if (! is_array($entries)) {
            $entries = [];
        }

        $sourcesMeta = $decoded['sources'] ?? [];
        if (! is_array($sourcesMeta)) {
            $sourcesMeta = [];
        }

        return [
            'version' => (int) ($decoded['version'] ?? 2),
            'updated_at' => is_string($decoded['updated_at'] ?? null) ? $decoded['updated_at'] : null,
            'sources' => $sourcesMeta,
            'entries' => $entries,
        ];
    }

    /**
     * @param  array{version?: int, updated_at?: string|null, sources?: array<string, mixed>, entries: array<string, array<string, mixed>>}  $manifest
     */
    public function saveManifest(array $manifest): void
    {
        $disk = Storage::disk($this->manifestDisk());
        $path = $this->manifestPath();
        $dir = dirname($path);
        if ($dir !== '.' && $dir !== '') {
            $disk->makeDirectory($dir);
        }

        $payload = [
            'version' => (int) ($manifest['version'] ?? 2),
            'updated_at' => now()->toIso8601String(),
            'sources' => $manifest['sources'] ?? [],
            'entries' => $manifest['entries'] ?? [],
        ];

        $disk->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
    }

    /**
     * @return array{version: int, updated_at: null, sources: array<string, mixed>, entries: array<string, array<string, mixed>>}
     */
    public function emptyManifest(): array
    {
        return [
            'version' => 2,
            'updated_at' => null,
            'sources' => [],
            'entries' => [],
        ];
    }

    /**
     * Refresh article URL lists from every enabled (or filtered) source into the manifest.
     *
     * @return array{manifest: array{version: int, updated_at: string|null, sources: array<string, mixed>, entries: array<string, array<string, mixed>>}, added: int, total_urls: int}
     */
    public function refreshManifestFromSources(?string $onlySourceId = null): array
    {
        $manifest = $this->loadManifest();
        $added = 0;
        $totalUrls = 0;

        foreach ($this->configuredSources($onlySourceId) as $source) {
            $sourceId = (string) $source['id'];
            $urls = $this->discoverUrlsForSource($source);
            $totalUrls += count($urls);

            foreach ($urls as $url) {
                $slug = $this->sourceSlugFromUrl($url, $source);
                $key = $this->entryKey($sourceId, $slug);
                if (! isset($manifest['entries'][$key])) {
                    $manifest['entries'][$key] = [
                        'source_id' => $sourceId,
                        'source_url' => $url,
                        'source_slug' => $slug,
                        'source_title' => null,
                        'status' => 'pending',
                        'autocvapply_slug' => null,
                        'autocvapply_title' => null,
                        'blog_id' => null,
                        'error' => null,
                        'updated_at' => null,
                    ];
                    $added++;
                } else {
                    $manifest['entries'][$key]['source_url'] = $url;
                    $manifest['entries'][$key]['source_id'] = $sourceId;
                }
            }

            $manifest['sources'][$sourceId] = [
                'name' => (string) ($source['name'] ?? $sourceId),
                'url_count' => count($urls),
                'updated_at' => now()->toIso8601String(),
            ];
        }

        $this->saveManifest($manifest);

        return [
            'manifest' => $manifest,
            'added' => $added,
            'total_urls' => $totalUrls,
        ];
    }

    /**
     * @param  array<string, mixed>  $source
     * @return array<int, string>
     */
    public function discoverUrlsForSource(array $source): array
    {
        $urls = [];

        foreach ($source['sitemap_urls'] ?? [] as $sitemapUrl) {
            if (! is_string($sitemapUrl) || trim($sitemapUrl) === '') {
                continue;
            }
            foreach ($this->fetchBlogUrlsFromSitemap(trim($sitemapUrl), $source) as $url) {
                $urls[] = $url;
            }
        }

        foreach ($source['index_urls'] ?? [] as $indexUrl) {
            if (! is_string($indexUrl) || trim($indexUrl) === '') {
                continue;
            }
            foreach ($this->discoverUrlsFromIndexPage(trim($indexUrl), $source) as $url) {
                $urls[] = $url;
            }
        }

        $urls = array_values(array_unique($urls));
        sort($urls);

        return $urls;
    }

    /**
     * @param  array<string, mixed>|null  $source
     * @return array<int, string>
     */
    public function fetchBlogUrlsFromSitemap(string $sitemapUrl, ?array $source = null): array
    {
        $xml = $this->fetchSitemapXml($sitemapUrl);
        if ($xml === null || $xml === '') {
            return [];
        }

        return $this->parseBlogUrlsFromSitemapXml($xml, $source, $sitemapUrl);
    }

    /**
     * Recursively expand sitemap indexes and filter article URLs.
     *
     * @param  array<string, mixed>|null  $source
     * @param  array<string, true>  $visited
     * @return array<int, string>
     */
    public function parseBlogUrlsFromSitemapXml(
        string $xml,
        ?array $source = null,
        ?string $originUrl = null,
        array &$visited = [],
        int $depth = 0,
    ): array {
        $maxFetches = max(1, (int) config('blog.import.sitemap_max_nested_fetches', 40));
        $urls = [];
        $childSitemaps = [];

        if (preg_match_all('#<loc>\s*([^<]+)\s*</loc>#i', $xml, $matches) !== false) {
            foreach ($matches[1] as $loc) {
                $loc = trim(html_entity_decode($loc, ENT_QUOTES | ENT_XML1));
                if ($loc === '') {
                    continue;
                }

                if ($this->looksLikeSitemapUrl($loc)) {
                    $childSitemaps[] = $loc;

                    continue;
                }

                if ($source === null) {
                    continue;
                }

                if ($this->isCompetitorBlogPostUrl($loc, $source)) {
                    $urls[] = $loc;
                }
            }
        }

        if ($depth < 3 && count($visited) < $maxFetches) {
            foreach ($childSitemaps as $child) {
                if (isset($visited[$child]) || count($visited) >= $maxFetches) {
                    continue;
                }
                if ($originUrl !== null && $this->sameUrl($child, $originUrl)) {
                    continue;
                }
                $visited[$child] = true;
                $childXml = $this->fetchSitemapXml($child);
                if ($childXml === null || $childXml === '') {
                    continue;
                }
                foreach ($this->parseBlogUrlsFromSitemapXml($childXml, $source, $child, $visited, $depth + 1) as $url) {
                    $urls[] = $url;
                }
            }
        }

        $urls = array_values(array_unique($urls));
        sort($urls);

        return $urls;
    }

    /**
     * @param  array<string, mixed>  $source
     * @return array<int, string>
     */
    public function discoverUrlsFromIndexPage(string $indexUrl, array $source): array
    {
        $markdown = null;

        if ($this->firecrawl->isConfigured()) {
            $scraped = $this->firecrawl->scrape($indexUrl, 60000);
            $markdown = $scraped['markdown'] ?? null;
        }

        if (! is_string($markdown) || trim($markdown) === '') {
            $fallback = $this->scrapeViaHttpFallback($indexUrl, 60000);
            $markdown = $fallback['markdown'] ?? null;
        }

        if (! is_string($markdown) || trim($markdown) === '') {
            return [];
        }

        $found = [];
        if (preg_match_all('#https?://[^\s\)\]\>\"\']+#i', $markdown, $matches) !== false) {
            foreach ($matches[0] as $raw) {
                $url = rtrim($raw, '.,);]');
                if ($this->isCompetitorBlogPostUrl($url, $source)) {
                    $found[] = $url;
                }
            }
        }

        if (preg_match_all('#\((/[^)\s]+)\)#', $markdown, $relMatches) !== false) {
            $scheme = parse_url($indexUrl, PHP_URL_SCHEME) ?: 'https';
            $host = parse_url($indexUrl, PHP_URL_HOST) ?: '';
            foreach ($relMatches[1] as $path) {
                if ($host === '') {
                    continue;
                }
                $url = $scheme.'://'.$host.$path;
                if ($this->isCompetitorBlogPostUrl($url, $source)) {
                    $found[] = $url;
                }
            }
        }

        return array_values(array_unique($found));
    }

    /**
     * @param  array<string, mixed>  $source
     */
    public function isCompetitorBlogPostUrl(string $url, array $source): bool
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');
        if ($host === '' || $path === '' || $path === '/') {
            return false;
        }

        $hostOk = false;
        foreach ($source['host_suffixes'] ?? [] as $suffix) {
            if (! is_string($suffix) || $suffix === '') {
                continue;
            }
            $suffix = strtolower($suffix);
            if ($host === $suffix || str_ends_with($host, '.'.$suffix) || str_ends_with($host, $suffix)) {
                $hostOk = true;
                break;
            }
        }
        if (! $hostOk) {
            return false;
        }

        foreach ($source['exclude_path_regexes'] ?? [] as $exclude) {
            if (is_string($exclude) && $exclude !== '' && preg_match($exclude, $path) === 1) {
                return false;
            }
        }

        $pathRegex = (string) ($source['path_regex'] ?? '');
        if ($pathRegex === '') {
            return false;
        }

        return preg_match($pathRegex, $path) === 1;
    }

    /**
     * @param  array<string, mixed>|null  $source
     */
    public function sourceSlugFromUrl(string $url, ?array $source = null): string
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
        $slug = trim($path, '/');

        foreach (['blog/', 'en/blog/', 'post/'] as $prefix) {
            if (str_starts_with($slug, $prefix)) {
                $slug = substr($slug, strlen($prefix));
                break;
            }
        }

        $slug = Str::slug($slug) ?: 'topic';
        if ($source !== null && isset($source['id'])) {
            return $slug;
        }

        return $slug;
    }

    public function entryKey(string $sourceId, string $slug): string
    {
        return $sourceId.':'.$slug;
    }

    /**
     * @return array{title: string, markdown: string, url: string}|null
     */
    public function scrapeTopicPage(string $url): ?array
    {
        $maxChars = (int) config('blog.import.scrape_max_markdown_chars', 24000);

        if ($this->firecrawl->isConfigured()) {
            $scraped = $this->firecrawl->scrape($url, $maxChars);
            if ($scraped !== null) {
                return $scraped;
            }
        }

        return $this->scrapeViaHttpFallback($url, $maxChars);
    }

    /**
     * @return array{title: string, markdown: string, url: string}|null
     */
    protected function scrapeViaHttpFallback(string $url, int $maxChars): ?array
    {
        try {
            $response = Http::timeout(60)
                ->withHeaders(['User-Agent' => 'AutoCVApplyBlogImporter/1.0'])
                ->get($url);
        } catch (Throwable $e) {
            Log::warning('Competitor page HTTP scrape failed.', [
                'url' => $url,
                'message' => $e->getMessage(),
            ]);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $html = $response->body();
        $title = $url;
        if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m) === 1) {
            $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5));
        }

        $text = preg_replace('#<(script|style|noscript)[^>]*>.*?</\1>#is', ' ', $html) ?? $html;
        $text = strip_tags($text);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5);
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        if (mb_strlen($text) > $maxChars) {
            $text = mb_substr($text, 0, $maxChars)."\n\n[truncated]";
        }

        return [
            'title' => $title !== '' ? $title : $url,
            'markdown' => $text,
            'url' => $url,
        ];
    }

    /**
     * Build an AutoCVApply rewrite brief from competitor topic inspiration (never republish their copy).
     *
     * @return array{
     *     topic: string,
     *     title: string,
     *     pillar_cluster: string,
     *     must_cover: array<int, string>,
     *     angle: string,
     *     research_appendix: string
     * }
     */
    public function rewriteBrief(string $sourceTitle, string $sourceMarkdown, string $sourceUrl): array
    {
        $clusterIds = array_column(BlogKeywordStrategy::clusters(), 'id');
        $clusterList = implode(', ', $clusterIds);
        $context = AutoCVApplyBlogContext::document();
        $outline = $this->compressSourceOutline($sourceMarkdown);

        $system = 'You rewrite competitor blog topics into original AutoCVApply SEO briefs. '
            .'Never copy competitor wording. Never mention AutoApplyMax, EasyApplyMax, LoopCV, Simplify, '
            .'Huntr, JobCopilot, Teal, Sonara, Kickresume, Wonsulting, Careerflow, LazyApply, Massive, '
            .'ApplyGlide, or their domains/Chrome store listings. '
            .'Map claims to AutoCVApply honestly: Auto Apply on supported job boards (user-started); '
            .'ATS/career sites use AutoFill/Draft All with the user submitting. '
            .'Prefer UK-default phrasing. Titles should be search-intent (How to / Best / vs / year), not brand-first. '
            .'Return JSON only.';

        $user = <<<USER
Authoritative AutoCVApply context:

{$context}

---
Competitor inspiration (topic only - do not quote or paraphrase closely):
Source URL (do not cite in article Sources): {$sourceUrl}
Source title: {$sourceTitle}
Source outline / notes:
{$outline}

---
Return JSON with keys:
- topic (one sentence search-intent topic for AutoCVApply)
- title (search-intent title, AutoCVApply at most once, preferably zero)
- pillar_cluster (one of: {$clusterList})
- must_cover (array of 3-6 AutoCVApply beats to cover)
- angle (short AutoCVApply angle paragraph)
USER;

        $decoded = $this->nanoGpt->chatJson([
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ], ['temperature' => 0.4]);

        if (! is_array($decoded)) {
            $decoded = [];
        }

        $topic = trim((string) ($decoded['topic'] ?? ''));
        $title = trim((string) ($decoded['title'] ?? ''));
        $cluster = trim((string) ($decoded['pillar_cluster'] ?? ''));
        $angle = trim((string) ($decoded['angle'] ?? ''));

        if ($topic === '') {
            $topic = $this->fallbackTopicFromSourceTitle($sourceTitle);
        }
        if ($title === '') {
            $title = $topic;
        }
        if (! in_array($cluster, $clusterIds, true)) {
            $cluster = $this->guessClusterFromTitle($title.' '.$topic);
        }

        $mustCover = [];
        foreach ($decoded['must_cover'] ?? [] as $item) {
            if (is_string($item) && trim($item) !== '') {
                $mustCover[] = trim($item);
            }
        }
        if ($mustCover === []) {
            $mustCover = [
                'Stay honest about board Auto Apply vs ATS user-submit',
                'Include TL;DR steps and FAQ',
                'Soft CTA to AutoCVApply login / Chrome extension',
            ];
        }

        $title = $this->stripCompetitorBrand($title);
        $topic = $this->stripCompetitorBrand($topic);
        $angle = $this->stripCompetitorBrand($angle);

        $researchAppendix = "## Competitor topic rewrite brief (inspiration only - never cite competitor)\n"
            ."Chosen title: {$title}\n"
            ."Angle: {$angle}\n"
            ."Pillar cluster: {$cluster}\n"
            ."Must-cover beats:\n- ".implode("\n- ", $mustCover)."\n\n"
            ."Do NOT cite competitor blogs, brands, or store listings as Sources.\n"
            .'Do NOT reuse competitor copy; write original AutoCVApply content.';

        return [
            'topic' => $topic,
            'title' => $title,
            'pillar_cluster' => $cluster,
            'must_cover' => $mustCover,
            'angle' => $angle,
            'research_appendix' => $researchAppendix,
        ];
    }

    public function stripCompetitorBrand(string $text): string
    {
        $patterns = $this->competitorBrandPatterns();
        $cleaned = $text;
        foreach ($patterns as $pattern) {
            $cleaned = preg_replace($pattern, 'AutoCVApply', $cleaned) ?? $cleaned;
        }

        return trim(preg_replace('/\s+/u', ' ', $cleaned) ?? $cleaned);
    }

    public function containsBlockedCompetitorBrand(string $text): bool
    {
        foreach ($this->competitorBrandPatterns() as $pattern) {
            if (preg_match($pattern, $text) === 1) {
                return true;
            }
        }

        return false;
    }

    public function isBlockedImportSourceUrl(string $url): bool
    {
        $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));
        if ($host === '') {
            return false;
        }

        $blocked = config('blog.sources.blocked_host_suffixes', []);
        if (! is_array($blocked)) {
            $blocked = [];
        }

        foreach ($blocked as $suffix) {
            if (! is_string($suffix) || $suffix === '') {
                continue;
            }
            $suffix = strtolower($suffix);
            if ($host === $suffix || str_ends_with($host, '.'.$suffix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    protected function competitorBrandPatterns(): array
    {
        $names = [
            'AutoApplyMax',
            'EasyApplyMax',
            'autoapplymax.com',
            'easyapplymax.com',
            'LazyApply',
            'ApplyGlide',
            'Massive',
            'UseMassive',
            'usemassive.com',
        ];

        foreach ($this->configuredSources() as $source) {
            foreach ($source['brand_names'] ?? [] as $name) {
                if (is_string($name) && trim($name) !== '') {
                    $names[] = trim($name);
                }
            }
        }

        $names = array_values(array_unique($names));
        usort($names, fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));

        $patterns = [];
        foreach ($names as $name) {
            $escaped = preg_quote($name, '/');
            if (str_contains($name, '.')) {
                $patterns[] = '/\b'.$escaped.'\b/iu';
            } else {
                $patterns[] = '/\b'.$escaped.'\b/iu';
            }
        }

        return $patterns;
    }

    protected function compressSourceOutline(string $markdown): string
    {
        $lines = preg_split("/\r\n|\n|\r/", $markdown) ?: [];
        $kept = [];
        foreach ($lines as $line) {
            $trim = trim($line);
            if ($trim === '') {
                continue;
            }
            if (preg_match('/^#{1,3}\s+/', $trim) === 1
                || preg_match('/^(\d+\.|[-*])\s+/', $trim) === 1
            ) {
                $kept[] = $this->stripCompetitorBrand($trim);
            }
            if (count($kept) >= 40) {
                break;
            }
        }

        if ($kept === []) {
            $snippet = mb_substr($this->stripCompetitorBrand(strip_tags($markdown)), 0, 2000);

            return $snippet !== '' ? $snippet : '(no outline extracted)';
        }

        return implode("\n", $kept);
    }

    protected function fallbackTopicFromSourceTitle(string $sourceTitle): string
    {
        $clean = $this->stripCompetitorBrand($sourceTitle);
        $clean = preg_replace('/\b(2024|2025|2026|2027)\b/u', '2026', $clean) ?? $clean;

        return trim($clean) !== '' ? trim($clean) : 'How to autofill job applications faster in 2026';
    }

    protected function guessClusterFromTitle(string $haystack): string
    {
        $h = Str::lower($haystack);

        return match (true) {
            str_contains($h, 'linkedin') => 'linkedin-auto-apply',
            str_contains($h, 'indeed') || str_contains($h, 'totaljobs') || str_contains($h, 'reed') => 'indeed-uk-boards',
            str_contains($h, 'workday') || str_contains($h, 'greenhouse') || str_contains($h, 'ats') => 'ats-workday-forms',
            str_contains($h, 'resume') || str_contains($h, 'cv ') || str_contains($h, ' cv') => 'resume-cv-uk',
            str_contains($h, 'draft') || str_contains($h, 'screening') => 'draft-all-screening',
            str_contains($h, 'cover letter') || str_contains($h, 'ats score') => 'ats-score-cover-letter',
            str_contains($h, 'burnout') || str_contains($h, 'strategy') => 'job-search-strategy',
            str_contains($h, 'best') || str_contains($h, ' vs ') || str_contains($h, 'extension') => 'autofill-extensions-comparison',
            default => 'autofill-job-applications',
        };
    }

    protected function fetchSitemapXml(string $url): ?string
    {
        try {
            $response = Http::timeout(60)
                ->accept('application/xml, text/xml, */*')
                ->withHeaders(['User-Agent' => 'AutoCVApplyBlogImporter/1.0'])
                ->get($url);
        } catch (Throwable $e) {
            Log::warning('Competitor sitemap fetch failed.', [
                'url' => $url,
                'message' => $e->getMessage(),
            ]);

            return $this->fetchSitemapXmlViaFirecrawl($url);
        }

        if ($response->successful()) {
            $body = $response->body();
            if ($this->xmlLooksLikeSitemap($body)) {
                return $body;
            }
        } else {
            Log::warning('Competitor sitemap HTTP error.', [
                'url' => $url,
                'status' => $response->status(),
            ]);
        }

        return $this->fetchSitemapXmlViaFirecrawl($url);
    }

    protected function fetchSitemapXmlViaFirecrawl(string $url): ?string
    {
        if (! $this->firecrawl->isConfigured()) {
            return null;
        }

        $scraped = $this->firecrawl->scrape($url, 200000);
        if ($scraped === null) {
            return null;
        }

        $markdown = $scraped['markdown'] ?? '';
        if (! is_string($markdown) || $markdown === '') {
            return null;
        }

        if ($this->xmlLooksLikeSitemap($markdown)) {
            return $markdown;
        }

        // Firecrawl often flattens XML into bare URLs; rebuild a minimal urlset.
        if (preg_match_all('#https?://[^\s<>\"\']+#i', $markdown, $matches) === false) {
            return null;
        }

        $locs = [];
        foreach ($matches[0] as $raw) {
            $candidate = rtrim($raw, '.,);]');
            if (filter_var($candidate, FILTER_VALIDATE_URL)) {
                $locs[] = $candidate;
            }
        }
        $locs = array_values(array_unique($locs));
        if ($locs === []) {
            return null;
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?><urlset>';
        foreach ($locs as $loc) {
            $xml .= '<loc>'.htmlspecialchars($loc, ENT_XML1).'</loc>';
        }
        $xml .= '</urlset>';

        return $xml;
    }

    protected function xmlLooksLikeSitemap(string $body): bool
    {
        return str_contains($body, '<loc>') || str_contains($body, '<urlset') || str_contains($body, '<sitemapindex');
    }

    protected function looksLikeSitemapUrl(string $url): bool
    {
        $path = strtolower((string) (parse_url($url, PHP_URL_PATH) ?? ''));

        return str_contains($path, 'sitemap') && str_ends_with($path, '.xml');
    }

    protected function sameUrl(string $a, string $b): bool
    {
        return rtrim($a, '/') === rtrim($b, '/');
    }
}
