<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\CompetitorBlogImportService;
use App\Services\FirecrawlService;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogArticleFormats;
use App\Support\BlogKeywordStrategy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Run order (AutoApplyMax-style corpus):
 * 1. blog:import-competitor-topics --limit=10 --skip-image  (creates Drafts)
 * 2. Spot-check 2-3 drafts (title, length, no competitor brand, product honesty)
 * 3. blog:publish --limit=10
 * 4. Repeat until catalog filled; weekly blog:generate --length=long continues for net-new
 * 5. blog:expand-published once for the six live posts
 */
class ImportCompetitorBlogTopicsCommand extends Command
{
    protected $signature = 'blog:import-competitor-topics
                            {--limit=10 : Max topics to process this run}
                            {--offset=0 : Skip the first N pending sitemap URLs}
                            {--only= : Process a single source slug or URL substring}
                            {--dry-run : List planned imports without scraping/generating}
                            {--skip-image : Skip hero image generation}
                            {--refresh-manifest : Re-fetch sitemap and merge new URLs into the manifest}';

    protected $description = 'Import AutoApplyMax sitemap topics as rewritten AutoCVApply draft posts (inspiration only)';

    public function handle(
        CompetitorBlogImportService $importer,
        BlogArticleGenerationService $blogArticles,
        NanoGptBlogHeroImageService $heroImages,
        FirecrawlService $firecrawl,
        NanoGptService $nanoGpt,
    ): int {
        $limit = max(1, (int) $this->option('limit'));
        $offset = max(0, (int) $this->option('offset'));
        $only = trim((string) $this->option('only'));
        $dryRun = (bool) $this->option('dry-run');
        $skipImage = (bool) $this->option('skip-image');
        $lengthKey = BlogArticleFormats::resolveArticleLength(
            (string) config('blog.import.default_length', 'pillar')
        );

        $this->info('Importing competitor blog topics as AutoCVApply drafts...');
        $this->line('  Length: '.$lengthKey);
        $this->line('  Manifest: '.$importer->manifestPath());

        $manifest = $importer->loadManifest();
        $refresh = (bool) $this->option('refresh-manifest') || $manifest['entries'] === [];

        if ($refresh) {
            $this->line('  Fetching sitemap: '.$importer->sitemapUrl());
            $urls = $importer->fetchBlogUrlsFromSitemap();
            if ($urls === []) {
                $this->error('No /blog/* URLs found in sitemap (or fetch failed).');

                return self::FAILURE;
            }
            foreach ($urls as $url) {
                $key = $importer->sourceSlugFromUrl($url);
                if (! isset($manifest['entries'][$key])) {
                    $manifest['entries'][$key] = [
                        'source_url' => $url,
                        'source_slug' => $key,
                        'source_title' => null,
                        'status' => 'pending',
                        'autocvapply_slug' => null,
                        'autocvapply_title' => null,
                        'blog_id' => null,
                        'error' => null,
                        'updated_at' => null,
                    ];
                } else {
                    $manifest['entries'][$key]['source_url'] = $url;
                }
            }
            $importer->saveManifest($manifest);
            $this->line('  Manifest entries: '.count($manifest['entries']));
        }

        $pending = $this->selectPendingEntries($manifest['entries'], $only, $offset, $limit);

        if ($pending === []) {
            $this->info('Nothing to import (no pending entries match filters).');

            return self::SUCCESS;
        }

        $this->line('  Processing: '.count($pending).' topic(s)');

        if ($dryRun) {
            foreach ($pending as $entry) {
                $this->line('  - '.$entry['source_slug'].' => '.$entry['source_url']);
            }
            $this->newLine();
            $this->info('Dry run: no scrape, rewrite, or database write.');

            return self::SUCCESS;
        }

        $format = [
            'key' => 'how-to',
            'name' => 'How-to guide',
            'hint' => 'Practical search-intent how-to with TL;DR and FAQ.',
            'title_pattern' => 'How to… (year)',
        ];

        $created = 0;
        $failed = 0;

        foreach ($pending as $key => $entry) {
            $url = (string) $entry['source_url'];
            $this->newLine();
            $this->info("Topic: {$key}");
            $this->line('  URL: '.$url);

            try {
                $scraped = $importer->scrapeTopicPage($url);
                if ($scraped === null) {
                    throw new \RuntimeException('Scrape returned no content.');
                }

                $sourceTitle = $scraped['title'];
                $this->line('  Source title: '.$this->truncate($sourceTitle, 90));
                $this->line('  Rewriting brief via NanoGPT...');

                $brief = $importer->rewriteBrief($sourceTitle, $scraped['markdown'], $url);
                $topic = $brief['topic'];
                $this->line('  AutoCVApply topic: '.$this->truncate($topic, 100));
                $this->line('  Cluster: '.$brief['pillar_cluster']);

                if ($this->slugOrTitleExists($brief['title'], Str::slug($brief['title']))) {
                    $manifest['entries'][$key] = array_merge($entry, [
                        'source_title' => $sourceTitle,
                        'status' => 'skipped_duplicate',
                        'autocvapply_title' => $brief['title'],
                        'updated_at' => now()->toIso8601String(),
                        'error' => 'Duplicate title/slug against existing blogs',
                    ]);
                    $importer->saveManifest($manifest);
                    $this->warn('  Skipped: duplicate title/slug.');

                    continue;
                }

                $seoTarget = BlogKeywordStrategy::targetForCluster($brief['pillar_cluster']);
                $seoTarget['must_cover'] = array_values(array_unique(array_merge(
                    $seoTarget['must_cover'] ?? [],
                    $brief['must_cover'],
                )));

                $researchSources = $this->fetchResearchSources($firecrawl, $topic, $seoTarget);
                $research = $this->buildResearch($topic, $seoTarget, $researchSources, $brief['research_appendix']);

                $imagePath = null;
                if (! $skipImage) {
                    $this->line('  Generating hero image...');
                    $imagePrompt = $heroImages->buildPrompt($nanoGpt, $topic);
                    $imagePath = $heroImages->generateAndStore($imagePrompt);
                } else {
                    $this->line('  Skipping hero image.');
                }

                $this->line('  Writing pillar article...');
                $post = $blogArticles->generateFullArticle(
                    $topic,
                    $research,
                    $lengthKey,
                    $format,
                    function (string $stage, array $context = []): void {
                        if ($stage === 'plan_complete') {
                            $this->line('  Planned: '.$this->truncate((string) ($context['title'] ?? ''), 90));
                        }
                        if ($stage === 'section_start' && isset($context['index'], $context['total'])) {
                            $this->line("  Section {$context['index']}/{$context['total']}");
                        }
                    },
                    $seoTarget,
                );

                $title = $this->preferBriefTitle($brief['title'], $post['title']);
                $title = $importer->stripCompetitorBrand($this->normaliseDashes($title));
                $slug = $this->uniqueSlug(Str::slug($title));
                $body = $importer->stripCompetitorBrand($this->normaliseDashes($post['body']));
                $excerpt = $importer->stripCompetitorBrand($this->normaliseDashes($post['excerpt']));

                if ($this->containsBlockedCompetitorBrand($title.$body.$excerpt)) {
                    throw new \RuntimeException('Generated content still mentions competitor brand.');
                }

                $tags = array_values(array_unique(array_merge(
                    BlogKeywordStrategy::tagsForTarget($seoTarget),
                    array_map(fn (string $tag): string => $this->normaliseDashes($tag), $post['tags'] ?? []),
                    [$seoTarget['id'], 'imported-topic'],
                )));

                $sources = FirecrawlService::selectSourcesForArticle($researchSources, $post['sources'] ?? []);
                $sources = array_values(array_filter(
                    $sources,
                    fn (array $source): bool => ! $this->isBlockedImportSourceUrl((string) ($source['url'] ?? '')),
                ));

                $blog = Blog::create([
                    'title' => $title,
                    'slug' => $slug,
                    'excerpt' => $excerpt,
                    'body' => $body,
                    'image_url' => $imagePath,
                    'tags' => $tags,
                    'sources' => $sources,
                    'status' => BlogStatus::Draft,
                    'published_at' => null,
                ]);

                $manifest['entries'][$key] = array_merge($entry, [
                    'source_title' => $sourceTitle,
                    'status' => 'drafted',
                    'autocvapply_slug' => $blog->slug,
                    'autocvapply_title' => $blog->title,
                    'blog_id' => $blog->id,
                    'error' => null,
                    'updated_at' => now()->toIso8601String(),
                ]);
                $importer->saveManifest($manifest);

                $this->info("  Drafted #{$blog->id}: {$blog->title}");
                $created++;
            } catch (Throwable $e) {
                $failed++;
                Log::warning('blog:import-competitor-topics failed for topic', [
                    'source_slug' => $key,
                    'message' => $e->getMessage(),
                ]);
                $manifest['entries'][$key] = array_merge($entry, [
                    'status' => 'failed',
                    'error' => $e->getMessage(),
                    'updated_at' => now()->toIso8601String(),
                ]);
                $importer->saveManifest($manifest);
                $this->error('  Failed: '.$e->getMessage());
            }
        }

        $this->newLine();
        $this->info("Done. Drafted: {$created}. Failed: {$failed}.");
        $this->line('Next: spot-check drafts, then blog:publish --limit=10');

        return $failed > 0 && $created === 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @return array<string, array<string, mixed>>
     */
    protected function selectPendingEntries(array $entries, string $only, int $offset, int $limit): array
    {
        $pending = [];
        foreach ($entries as $key => $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $status = (string) ($entry['status'] ?? 'pending');
            if (! in_array($status, ['pending', 'failed'], true)) {
                continue;
            }
            if ($only !== '') {
                $hay = strtolower($key.' '.($entry['source_url'] ?? ''));
                if (! str_contains($hay, strtolower($only))) {
                    continue;
                }
            }
            $pending[$key] = $entry;
        }

        ksort($pending);
        $slice = array_slice($pending, $offset, $limit, true);

        return $slice;
    }

    /**
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>}  $seoTarget
     * @return array<int, array{title: string, url: string, description: string}>
     */
    protected function fetchResearchSources(FirecrawlService $firecrawl, string $topic, array $seoTarget): array
    {
        $limit = (int) config('blog.generate.firecrawl_search_limit', 8);
        $query = trim($seoTarget['primary'].' '.$topic);

        try {
            return $firecrawl->search($query !== '' ? $query : $topic, $limit);
        } catch (Throwable $e) {
            $this->warn('  Firecrawl search failed; continuing without web sources.');

            return [];
        }
    }

    /**
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>}  $seoTarget
     * @param  array<int, array{title: string, url: string, description: string}>  $researchSources
     */
    protected function buildResearch(string $topic, array $seoTarget, array $researchSources, string $appendix): string
    {
        $context = AutoCVApplyBlogContext::document();
        $seoBlock = BlogKeywordStrategy::promptBlock($seoTarget);
        $webResearch = FirecrawlService::formatSourcesForPrompt($researchSources);
        $webSection = $webResearch !== '' ? "{$webResearch}\n\n" : '';

        return "## Article topic\n{$topic}\n\n{$appendix}\n\n{$seoBlock}\n\n{$webSection}## Authoritative AutoCVApply context (ground truth only)\n\n{$context}";
    }

    protected function preferBriefTitle(string $briefTitle, string $plannedTitle): string
    {
        $briefTitle = trim($briefTitle);
        $plannedTitle = trim($plannedTitle);

        if ($briefTitle === '') {
            return $plannedTitle;
        }

        if (BlogKeywordStrategy::titleLooksGeneric($briefTitle) && ! BlogKeywordStrategy::titleLooksGeneric($plannedTitle)) {
            return $plannedTitle;
        }

        return $briefTitle;
    }

    protected function slugOrTitleExists(string $title, string $slug): bool
    {
        return Blog::query()
            ->where(function ($q) use ($title, $slug): void {
                $q->where('slug', $slug)->orWhere('title', $title);
            })
            ->exists();
    }

    protected function uniqueSlug(string $base): string
    {
        $slug = $base !== '' ? $base : 'blog-post';
        $candidate = $slug;
        $i = 2;
        while (Blog::query()->where('slug', $candidate)->exists()) {
            $candidate = $slug.'-'.$i;
            $i++;
        }

        return $candidate;
    }

    protected function containsBlockedCompetitorBrand(string $text): bool
    {
        return (bool) preg_match('/\b(AutoApplyMax|EasyApplyMax|autoapplymax\.com|easyapplymax\.com)\b/iu', $text);
    }

    protected function isBlockedImportSourceUrl(string $url): bool
    {
        $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));

        return str_ends_with($host, 'autoapplymax.com')
            || str_ends_with($host, 'easyapplymax.com');
    }

    protected function normaliseDashes(string $text): string
    {
        return str_replace(["\u{2014}", "\u{2013}"], '-', $text);
    }

    protected function truncate(string $text, int $max): string
    {
        $text = trim($text);
        if (mb_strlen($text) <= $max) {
            return $text;
        }

        return mb_substr($text, 0, $max - 1).'...';
    }
}
