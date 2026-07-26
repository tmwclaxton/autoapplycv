<?php

namespace App\Services;

use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogCompetitorComparisons;
use Illuminate\Support\Facades\Log;

/**
 * Firecrawl multi-page research for competitor comparison posts.
 *
 * The MCP Firecrawl server exposes scrape/map/search (not a separate crawl tool).
 * This service scrapes homepage + key paths to build a holistic brief.
 */
class CompetitorComparisonResearchService
{
    public function __construct(private readonly FirecrawlService $firecrawl) {}

    /**
     * @param  array<string, mixed>  $definition
     * @return array{
     *     competitor: string,
     *     homepage_url: string,
     *     pages: array<int, array{url: string, title: string, markdown: string, ok: bool}>,
     *     brief_markdown: string
     * }
     */
    public function research(array $definition): array
    {
        $competitor = (string) $definition['competitor'];
        $homepage = (string) $definition['homepage_url'];
        $urls = $this->urlsForDefinition($definition);

        $pages = [];
        foreach ($urls as $url) {
            $scraped = $this->firecrawl->scrape($url, (int) config('blog.comparisons.scrape_max_markdown_chars', 12000));
            if ($scraped === null) {
                $pages[] = [
                    'url' => $url,
                    'title' => '',
                    'markdown' => '',
                    'ok' => false,
                ];
                Log::warning('Competitor comparison scrape failed.', [
                    'competitor' => $competitor,
                    'url' => $url,
                ]);

                continue;
            }

            $pages[] = [
                'url' => $scraped['url'],
                'title' => $scraped['title'],
                'markdown' => $scraped['markdown'],
                'ok' => true,
            ];
        }

        return [
            'competitor' => $competitor,
            'homepage_url' => $homepage,
            'pages' => $pages,
            'brief_markdown' => $this->formatBrief($definition, $pages),
        ];
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array<int, string>
     */
    public function urlsForDefinition(array $definition): array
    {
        $urls = [(string) $definition['homepage_url']];

        foreach (['pricing_url', 'features_url'] as $key) {
            $value = $definition[$key] ?? null;
            if (is_string($value) && trim($value) !== '') {
                $urls[] = trim($value);
            }
        }

        $extra = config('blog.comparisons.extra_paths.'.$definition['id'], []);
        if (is_array($extra)) {
            foreach ($extra as $pathOrUrl) {
                if (! is_string($pathOrUrl) || trim($pathOrUrl) === '') {
                    continue;
                }
                $candidate = trim($pathOrUrl);
                if (! str_starts_with($candidate, 'http')) {
                    $candidate = rtrim((string) $definition['homepage_url'], '/').'/'.ltrim($candidate, '/');
                }
                $urls[] = $candidate;
            }
        }

        return array_values(array_unique($urls));
    }

    /**
     * @param  array<string, mixed>  $definition
     * @param  array<int, array{url: string, title: string, markdown: string, ok: bool}>  $pages
     */
    public function formatBrief(array $definition, array $pages): string
    {
        $competitor = (string) $definition['competitor'];
        $lines = [
            "## Competitor research brief: {$competitor}",
            '',
            'Homepage: '.(string) $definition['homepage_url'],
            'Category: '.(string) $definition['category'],
            '',
            '### Curated notes (from prior research)',
        ];

        foreach ($definition['crawl_summary'] ?? [] as $bullet) {
            if (is_string($bullet) && $bullet !== '') {
                $lines[] = '- '.$bullet;
            }
        }

        $lines[] = '';
        $lines[] = '### Live Firecrawl page scrapes';

        $anyOk = false;
        foreach ($pages as $page) {
            $status = $page['ok'] ? 'ok' : 'failed';
            $lines[] = '';
            $lines[] = "#### {$page['url']} ({$status})";
            if (! $page['ok']) {
                $lines[] = 'Scrape failed or returned empty content.';

                continue;
            }
            $anyOk = true;
            if ($page['title'] !== '') {
                $lines[] = 'Title: '.$page['title'];
            }
            $lines[] = '';
            $lines[] = mb_substr($page['markdown'], 0, 4000);
        }

        if (! $anyOk) {
            $lines[] = '';
            $lines[] = 'No live pages scraped successfully. Use curated notes only; do not invent features or prices.';
        }

        $lines[] = '';
        $lines[] = '### AutoCVApply product truth';
        $lines[] = '';
        $lines[] = AutoCVApplyBlogContext::document();

        return implode("\n", $lines);
    }

    /**
     * @return array<int, string>
     */
    public static function comparisonIds(): array
    {
        return array_column(BlogCompetitorComparisons::definitions(), 'id');
    }
}
