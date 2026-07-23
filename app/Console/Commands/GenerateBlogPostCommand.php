<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\FirecrawlService;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogArticleFormats;
use App\Support\BlogKeywordStrategy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class GenerateBlogPostCommand extends Command
{
    protected $signature = 'blog:generate
                            {--length=medium : Article length: short, medium, long, or random}
                            {--cluster= : Force an SEO cluster id from config/blog.php}
                            {--update= : Regenerate an existing blog by id or slug}
                            {--keep-slug : When updating, keep the existing slug}
                            {--keep-image : When updating, keep the existing hero image}
                            {--dry-run : Output topic and format without generating or saving}';

    protected $description = 'Generate a weekly AI blog post about AutoCVApply for job seekers';

    public function handle(
        NanoGptService $nanoGpt,
        BlogArticleGenerationService $blogArticles,
        NanoGptBlogHeroImageService $heroImages,
        FirecrawlService $firecrawl,
    ): int {
        $this->info('Generating AutoCVApply blog post...');

        try {
            $lengthKey = BlogArticleFormats::resolveArticleLength((string) $this->option('length'));
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $existing = null;
        $updateOption = trim((string) $this->option('update'));
        if ($updateOption !== '') {
            $existing = $this->findBlogForUpdate($updateOption);
            if ($existing === null) {
                $this->error('No blog found for --update='.$updateOption);

                return self::FAILURE;
            }
            $this->line('  Updating existing blog #'.$existing->id.' ('.$existing->slug.')');
        }

        Log::info('blog:generate started', [
            'length_key' => $lengthKey,
            'word_guidance' => BlogArticleFormats::articleBodyWordGuidance($lengthKey),
            'cluster' => $this->option('cluster'),
            'update' => $updateOption !== '' ? $updateOption : null,
        ]);

        $recent = $this->recentBlogSignals($existing?->id);
        $format = BlogArticleFormats::pickAvoidingRecent($recent['titles']);
        $titleStyle = BlogKeywordStrategy::selectTitleStyle($recent['titles']);
        $seoTarget = $this->resolveSeoTarget($recent['titles'], $recent['tags']);
        $seoTarget['title_style'] = $titleStyle;

        $this->line('  SEO cluster: '.$seoTarget['id']);
        $this->line('  Primary keyword: '.$seoTarget['primary']);
        $this->line('  Supporting: '.implode(', ', $seoTarget['selected_supporting']));
        $this->line('  Title style: '.$titleStyle['id']);
        $this->line('  Format: '.$format['name']);

        $topic = $this->generateTopic($nanoGpt, $format['name'], $recent['titles'], $seoTarget);

        $this->line("  Topic: {$topic}");
        $this->line('  Length: '.$lengthKey.' ('.BlogArticleFormats::articleBodyWordGuidance($lengthKey).')');

        if ($this->option('dry-run')) {
            $this->newLine();
            $this->info('Dry run: no article or database write.');

            return self::SUCCESS;
        }

        $researchSources = $this->fetchResearchSources($firecrawl, $topic, $seoTarget);
        $research = $this->buildResearchBrief($topic, $seoTarget, $researchSources);

        $imagePath = $existing?->getRawOriginal('image_url');
        $keepImage = (bool) $this->option('keep-image') && $existing !== null;
        if (! $keepImage) {
            $this->line('  Generating hero image...');
            $imagePrompt = $heroImages->buildPrompt($nanoGpt, $topic);
            $generatedPath = $heroImages->generateAndStore($imagePrompt);
            if ($generatedPath) {
                $imagePath = $generatedPath;
                $this->line('  Hero image: '.$imagePath);
            } else {
                $this->warn('  No hero image generated'.($existing ? '; keeping previous image if any' : ''));
            }
        } else {
            $this->line('  Keeping existing hero image.');
        }

        $this->line('  Writing article...');
        $post = $blogArticles->generateFullArticle($topic, $research, $lengthKey, $format, function (string $stage, array $context = []): void {
            if ($stage === 'planning_start') {
                $this->line(sprintf(
                    '  Planning structure (%d sections, ~%d-%d words each)...',
                    $context['section_count'] ?? 0,
                    $context['words_per_section_min'] ?? 0,
                    $context['words_per_section_max'] ?? 0,
                ));

                return;
            }
            if ($stage === 'plan_complete') {
                $this->line('  Planned title: '.$this->truncateLogLine((string) ($context['title'] ?? ''), 100));

                return;
            }
            if ($stage === 'section_start' && isset($context['index'], $context['total'])) {
                $heading = $context['heading'] ?? '';
                $this->line("  Section {$context['index']} of {$context['total']}: ".$this->truncateLogLine((string) $heading, 70));

                return;
            }
            if ($stage === 'section_done' && isset($context['index'], $context['total'])) {
                $this->line(sprintf(
                    '    -> %d chars, ~%d words',
                    $context['content_chars'] ?? 0,
                    $context['content_words_approx'] ?? 0,
                ));
            }
        }, $seoTarget);

        $title = $this->normaliseDashes($post['title']);
        if (
            BlogKeywordStrategy::titleLooksGeneric($title)
            || BlogKeywordStrategy::titleTooSimilarToRecent($title, $recent['titles'])
        ) {
            $this->warn('  Planned title looked generic or too similar; rewriting for variety.');
            $title = $this->rewriteGenericTitle($nanoGpt, $title, $topic, $seoTarget, $recent['titles']);
        }

        $body = $this->rewriteLocalhostUrls($this->normaliseDashes($post['body']));
        $excerpt = $this->rewriteLocalhostUrls($this->normaliseDashes($post['excerpt']));
        $tags = array_values(array_unique(array_merge(
            BlogKeywordStrategy::tagsForTarget($seoTarget),
            array_map(fn (string $tag): string => $this->normaliseDashes($tag), $post['tags'] ?? []),
            [$seoTarget['id']],
        )));
        $sources = $this->normaliseDashesInSources(
            FirecrawlService::selectSourcesForArticle($researchSources, $post['sources'] ?? [])
        );

        $keepSlug = (bool) $this->option('keep-slug') && $existing !== null;
        $slug = $keepSlug
            ? $existing->slug
            : $this->uniqueSlug(Str::slug($title), $existing?->id);

        $payload = [
            'title' => $title,
            'slug' => $slug,
            'excerpt' => $excerpt,
            'body' => $body,
            'image_url' => $imagePath,
            'tags' => $tags,
            'sources' => $sources,
            'status' => BlogStatus::Published,
            'published_at' => $existing?->published_at ?? now(),
        ];

        if ($existing !== null) {
            $existing->update($payload);
            $blog = $existing->fresh();
            $this->newLine();
            $this->info("Updated: {$blog->title}");
        } else {
            $blog = Blog::create($payload);
            $this->newLine();
            $this->info("Published: {$blog->title}");
        }

        $this->line("  Slug: {$blog->slug}");
        $this->line('  Tags: '.implode(', ', $blog->tags ?? []));
        $this->line('  Sources: '.count($blog->sources ?? []));
        $this->line('  Image: '.($blog->getRawOriginal('image_url') ? 'Yes' : 'No'));
        $this->line('  URL: '.route('blog.show', $blog->slug));

        return self::SUCCESS;
    }

    /**
     * @param  array<int, string>  $recentTitles
     * @param  array<int, string>  $recentTags
     * @return array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>,
     *     must_cover: array<int, string>,
     *     selected_supporting: array<int, string>
     * }
     */
    protected function resolveSeoTarget(array $recentTitles, array $recentTags): array
    {
        $clusterOption = trim((string) $this->option('cluster'));
        if ($clusterOption !== '') {
            return BlogKeywordStrategy::targetForCluster($clusterOption);
        }

        // Prefer a pillar "What is AutoCVApply?" post when the catalog lacks one.
        if (! $this->catalogHasProductIntro($recentTitles, $recentTags)) {
            $this->line('  Catalog missing product intro - forcing what-is-autocvapply cluster.');

            return BlogKeywordStrategy::targetForCluster('what-is-autocvapply');
        }

        return BlogKeywordStrategy::selectTarget($recentTitles, $recentTags);
    }

    /**
     * @param  array<int, string>  $recentTitles
     * @param  array<int, string>  $recentTags
     */
    protected function catalogHasProductIntro(array $recentTitles, array $recentTags): bool
    {
        $haystack = BlogKeywordStrategy::normaliseHaystack($recentTitles, $recentTags);

        return str_contains($haystack, 'what is autocvapply')
            || str_contains($haystack, 'what-is-autocvapply');
    }

    protected function findBlogForUpdate(string $idOrSlug): ?Blog
    {
        if (ctype_digit($idOrSlug)) {
            return Blog::query()->find((int) $idOrSlug);
        }

        return Blog::query()->where('slug', $idOrSlug)->first();
    }

    /**
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>}  $seoTarget
     * @return array<int, array{title: string, url: string, description: string}>
     */
    protected function fetchResearchSources(FirecrawlService $firecrawl, string $topic, array $seoTarget): array
    {
        $limit = (int) config('blog.generate.firecrawl_search_limit', 8);
        $minBeforeBroaden = max(1, (int) config('blog.sources.min_before_broaden', 2));
        $primaryQuery = trim($seoTarget['primary'].' '.$topic);
        if ($primaryQuery === '') {
            $primaryQuery = $topic;
        }

        $this->line('  Researching via Firecrawl search...');
        $sources = $this->runFirecrawlSearch($firecrawl, $primaryQuery, $limit);

        if (count($sources) < $minBeforeBroaden) {
            $broadQuery = $this->broadenResearchQuery($topic, $seoTarget);
            if ($broadQuery !== '' && strcasecmp($broadQuery, $primaryQuery) !== 0) {
                $this->line('  Broadening Firecrawl search (fewer than '.$minBeforeBroaden.' usable sources)...');
                $this->line('  Broad query: '.$this->truncateLogLine($broadQuery, 100));
                $sources = $this->mergeResearchSources(
                    $sources,
                    $this->runFirecrawlSearch($firecrawl, $broadQuery, $limit),
                );
            }
        }

        if ($sources === []) {
            $this->warn('  No Firecrawl research results; continuing without web sources.');

            return [];
        }

        $this->line('  Research sources: '.count($sources));

        return $sources;
    }

    /**
     * @return array<int, array{title: string, url: string, description: string}>
     */
    protected function runFirecrawlSearch(FirecrawlService $firecrawl, string $query, int $limit): array
    {
        $this->line('  Query: '.$this->truncateLogLine($query, 100));

        try {
            return $firecrawl->search($query, $limit);
        } catch (\Throwable $e) {
            Log::warning('blog:generate Firecrawl search failed; continuing without web sources.', [
                'query' => $query,
                'message' => $e->getMessage(),
            ]);
            $this->warn('  Firecrawl search failed for query; continuing.');

            return [];
        }
    }

    /**
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>}  $seoTarget
     */
    protected function broadenResearchQuery(string $topic, array $seoTarget): string
    {
        $supporting = array_values(array_filter(
            $seoTarget['selected_supporting'] ?? [],
            fn (mixed $keyword): bool => is_string($keyword) && trim($keyword) !== '',
        ));
        $parts = array_filter([
            $supporting[0] ?? null,
            $supporting[1] ?? null,
            'AutoCVApply',
            $topic,
        ], fn (mixed $part): bool => is_string($part) && trim($part) !== '');

        return trim(implode(' ', $parts));
    }

    /**
     * @param  array<int, array{title: string, url: string, description: string}>  $primary
     * @param  array<int, array{title: string, url: string, description: string}>  $extra
     * @return array<int, array{title: string, url: string, description: string}>
     */
    protected function mergeResearchSources(array $primary, array $extra): array
    {
        $merged = [];
        $seen = [];
        foreach (array_merge($primary, $extra) as $source) {
            $key = strtolower($source['url']);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $merged[] = $source;
        }

        return $merged;
    }

    /**
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>}  $seoTarget
     * @param  array<int, array{title: string, url: string, description: string}>  $researchSources
     */
    protected function buildResearchBrief(string $topic, array $seoTarget, array $researchSources = []): string
    {
        $context = AutoCVApplyBlogContext::document();
        $seoBlock = BlogKeywordStrategy::promptBlock($seoTarget);
        $webResearch = FirecrawlService::formatSourcesForPrompt($researchSources);
        $webSection = $webResearch !== '' ? "{$webResearch}\n\n" : '';

        return "## Article topic\n{$topic}\n\n{$seoBlock}\n\n{$webSection}## Authoritative AutoCVApply context (ground truth only)\n\n{$context}";
    }

    /**
     * @param  array<int, string>  $recentTitles
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>, angle_hints?: array<int, string>, must_cover?: array<int, string>}  $seoTarget
     */
    protected function generateTopic(NanoGptService $nanoGpt, string $formatName, array $recentTitles, array $seoTarget): string
    {
        $today = now()->format('jS F Y');
        $angle = BlogArticleFormats::topicAngles()[array_rand(BlogArticleFormats::topicAngles())];
        $contextBlock = AutoCVApplyBlogContext::document();
        $seoBlock = BlogKeywordStrategy::promptBlock($seoTarget);
        $avoidSection = '';

        if ($recentTitles !== []) {
            $list = implode("\n", array_map(fn (string $t): string => "- {$t}", $recentTitles));
            $avoidSection = "\n\nRecently published titles - do NOT overlap in angle or wording:\n{$list}";
        }

        $system = 'You are the SEO content strategist for AutoCVApply (autocvapply.com). '
            .'Suggest one specific, product-led blog topic for UK job seekers that targets the SEO keyword cluster below. '
            .'The topic must name a real AutoCVApply workflow (AutoFill, Draft All, and/or Auto Apply) and a real board or ATS when the cluster requires it. '
            .'Do NOT use vague slogans like "save time and reduce errors" or "Beginner\'s Guide". '
            .'Follow the required title style so this post will not look like the others on the blog index. '
            ."Format: {$formatName}. "
            .'The topic sentence must naturally include or clearly target the primary keyword (no stuffing). '
            ."Return only the topic as one short sentence.{$avoidSection}";

        $user = "{$seoBlock}\n\nAuthoritative context:\n\n{$contextBlock}\n\n---\nToday is {$today}.\nSecondary focus area (optional colour): {$angle}";

        $maxAttempts = 3;
        $lastException = null;
        $lastTopic = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $topic = trim((string) $nanoGpt->chat([
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ], ['temperature' => 0.7]));

                if ($topic === '') {
                    throw new \RuntimeException('Topic generation returned empty text.');
                }

                if (
                    BlogKeywordStrategy::titleLooksGeneric($topic)
                    || BlogKeywordStrategy::titleTooSimilarToRecent($topic, $recentTitles)
                ) {
                    $lastTopic = $topic;
                    $this->warn("  Topic attempt {$attempt} looked too generic or similar; retrying...");

                    continue;
                }

                return $topic;
            } catch (\Throwable $e) {
                $lastException = $e;
                $this->warn("  Topic generation attempt {$attempt} failed: {$e->getMessage()}");

                if ($attempt < $maxAttempts) {
                    sleep($attempt * 2);
                }
            }
        }

        if (is_string($lastTopic) && $lastTopic !== '') {
            $this->warn('  Falling back to last topic draft despite generic wording.');

            return $lastTopic;
        }

        throw $lastException ?? new \RuntimeException('Topic generation failed.');
    }

    /**
     * @param  array{id: string, primary: string, selected_supporting: array<int, string>, title_style?: array<string, mixed>}  $seoTarget
     * @param  array<int, string>  $recentTitles
     */
    protected function rewriteGenericTitle(
        NanoGptService $nanoGpt,
        string $title,
        string $topic,
        array $seoTarget,
        array $recentTitles = [],
    ): string {
        $style = is_array($seoTarget['title_style'] ?? null) ? $seoTarget['title_style'] : null;
        $styleHint = is_array($style)
            ? trim(($style['label'] ?? '').': '.($style['hint'] ?? '').' Example: '.($style['example'] ?? ''))
            : 'Feature or board first; avoid Beginner\'s Guide and save-time slogans.';
        $recentList = $recentTitles === []
            ? '(none)'
            : implode("\n", array_map(fn (string $t): string => "- {$t}", $recentTitles));

        try {
            $rewritten = trim((string) $nanoGpt->chat([
                [
                    'role' => 'system',
                    'content' => 'Rewrite the blog title for AutoCVApply SEO. '
                        .'Keep it under 90 characters. Include the primary keyword naturally. '
                        .'Name a product workflow or board/ATS when possible. '
                        .'Return only the title. '
                        .'Never use "Beginner\'s Guide", "save time", "cut errors", or "reduce errors". '
                        .'Mention AutoCVApply at most once; do not end with "with AutoCVApply". '
                        .'The opening words must differ from the recent titles list.',
                ],
                [
                    'role' => 'user',
                    'content' => "Primary keyword: {$seoTarget['primary']}\nTitle style: {$styleHint}\nTopic: {$topic}\nCurrent title: {$title}\n\nRecent titles to differentiate from:\n{$recentList}",
                ],
            ], ['temperature' => 0.5]));

            if (
                $rewritten !== ''
                && ! BlogKeywordStrategy::titleLooksGeneric($rewritten)
                && ! BlogKeywordStrategy::titleTooSimilarToRecent($rewritten, $recentTitles)
            ) {
                return $this->normaliseDashes($rewritten);
            }
        } catch (\Throwable $e) {
            Log::warning('blog:generate title rewrite failed', ['message' => $e->getMessage()]);
        }

        return $this->normaliseDashes($title);
    }

    /**
     * @return array{titles: array<int, string>, tags: array<int, string>}
     */
    protected function recentBlogSignals(?int $excludeId = null, int $limit = 20): array
    {
        $query = Blog::query()
            ->latest('published_at')
            ->limit($limit);

        if ($excludeId !== null) {
            $query->where('id', '!=', $excludeId);
        }

        $blogs = $query->get(['title', 'tags']);

        $titles = $blogs->pluck('title')->filter()->values()->all();
        $tags = $blogs
            ->pluck('tags')
            ->flatten()
            ->filter(fn (mixed $tag): bool => is_string($tag) && trim($tag) !== '')
            ->unique()
            ->values()
            ->all();

        return [
            'titles' => $titles,
            'tags' => $tags,
        ];
    }

    protected function uniqueSlug(string $base, ?int $ignoreId = null): string
    {
        $slug = $base;
        $attempt = 0;

        while (
            Blog::query()
                ->where('slug', $slug)
                ->when($ignoreId !== null, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $attempt++;
            $slug = $base.'-'.$attempt;
        }

        return $slug;
    }

    protected function rewriteLocalhostUrls(string $text): string
    {
        $public = rtrim((string) config('blog.public_site_url', 'https://autocvapply.com'), '/');

        $rewritten = preg_replace(
            '#https?://(?:localhost|127\.0\.0\.1)(?::\d+)?#i',
            $public,
            $text,
        );

        return is_string($rewritten) ? $rewritten : $text;
    }

    protected function normaliseDashes(string $text): string
    {
        return str_replace(["\u{2014}", "\u{2013}"], '-', $text);
    }

    /**
     * @param  array<int, array<string, mixed>>  $sources
     * @return array<int, array<string, mixed>>
     */
    protected function normaliseDashesInSources(array $sources): array
    {
        return array_map(function (array $source): array {
            foreach (['title', 'description'] as $key) {
                if (isset($source[$key]) && is_string($source[$key])) {
                    $source[$key] = $this->normaliseDashes($source[$key]);
                }
            }

            return $source;
        }, $sources);
    }

    protected function truncateLogLine(string $text, int $maxChars): string
    {
        $text = trim($text);
        if (mb_strlen($text) <= $maxChars) {
            return $text;
        }

        return mb_substr($text, 0, $maxChars).'…';
    }
}
