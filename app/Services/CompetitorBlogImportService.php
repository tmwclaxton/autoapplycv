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
        return (string) config('blog.import.manifest_path', 'blog-imports/autoapplymax-manifest.json');
    }

    public function sitemapUrl(): string
    {
        return (string) config('blog.import.sitemap_url', 'https://www.autoapplymax.com/sitemap.xml');
    }

    /**
     * @return array{version: int, source: string, updated_at: string|null, entries: array<string, array<string, mixed>>}
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

        return [
            'version' => (int) ($decoded['version'] ?? 1),
            'source' => (string) ($decoded['source'] ?? $this->sitemapUrl()),
            'updated_at' => is_string($decoded['updated_at'] ?? null) ? $decoded['updated_at'] : null,
            'entries' => $entries,
        ];
    }

    /**
     * @param  array{version?: int, source?: string, updated_at?: string|null, entries: array<string, array<string, mixed>>}  $manifest
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
            'version' => (int) ($manifest['version'] ?? 1),
            'source' => (string) ($manifest['source'] ?? $this->sitemapUrl()),
            'updated_at' => now()->toIso8601String(),
            'entries' => $manifest['entries'] ?? [],
        ];

        $disk->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
    }

    /**
     * @return array{version: int, source: string, updated_at: null, entries: array<string, array<string, mixed>>}
     */
    public function emptyManifest(): array
    {
        return [
            'version' => 1,
            'source' => $this->sitemapUrl(),
            'updated_at' => null,
            'entries' => [],
        ];
    }

    /**
     * @return array<int, string>
     */
    public function fetchBlogUrlsFromSitemap(?string $sitemapUrl = null): array
    {
        $url = $sitemapUrl ?? $this->sitemapUrl();

        try {
            $response = Http::timeout(60)
                ->accept('application/xml, text/xml, */*')
                ->get($url);
        } catch (Throwable $e) {
            Log::warning('Competitor sitemap fetch failed.', [
                'url' => $url,
                'message' => $e->getMessage(),
            ]);

            return [];
        }

        if (! $response->successful()) {
            Log::warning('Competitor sitemap HTTP error.', [
                'url' => $url,
                'status' => $response->status(),
            ]);

            return [];
        }

        return $this->parseBlogUrlsFromSitemapXml($response->body());
    }

    /**
     * @return array<int, string>
     */
    public function parseBlogUrlsFromSitemapXml(string $xml): array
    {
        $urls = [];
        if (preg_match_all('#<loc>\s*([^<]+)\s*</loc>#i', $xml, $matches) !== false) {
            foreach ($matches[1] as $loc) {
                $loc = trim(html_entity_decode($loc, ENT_QUOTES | ENT_XML1));
                if ($this->isCompetitorBlogPostUrl($loc)) {
                    $urls[] = $loc;
                }
            }
        }

        $urls = array_values(array_unique($urls));
        sort($urls);

        return $urls;
    }

    public function isCompetitorBlogPostUrl(string $url): bool
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');

        if (! str_ends_with($host, 'autoapplymax.com')) {
            return false;
        }

        if (! preg_match('#^/blog/[^/]+/?$#', $path)) {
            return false;
        }

        $slug = trim($path, '/');
        $slug = str_starts_with($slug, 'blog/') ? substr($slug, 5) : $slug;

        return $slug !== '' && $slug !== 'blog';
    }

    public function sourceSlugFromUrl(string $url): string
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
        $slug = trim($path, '/');
        if (str_starts_with($slug, 'blog/')) {
            $slug = substr($slug, 5);
        }

        return Str::slug($slug) ?: 'topic';
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
            .'Never copy competitor wording. Never mention AutoApplyMax, EasyApplyMax, or their Chrome store. '
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
            ."Do NOT cite AutoApplyMax, EasyApplyMax, or their store listings as Sources.\n"
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
        $patterns = [
            '/\bAutoApplyMax\b/iu',
            '/\bEasyApplyMax\b/iu',
            '/\bautoapplymax\.com\b/iu',
            '/\beasyapplymax\.com\b/iu',
        ];

        $cleaned = preg_replace($patterns, 'AutoCVApply', $text) ?? $text;

        return trim(preg_replace('/\s+/u', ' ', $cleaned) ?? $cleaned);
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
        $clean = preg_replace('/\b(2024|2025|2026)\b/u', '2026', $clean) ?? $clean;

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
}
