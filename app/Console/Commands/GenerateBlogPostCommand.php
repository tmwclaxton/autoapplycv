<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\NanoGptService;
use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogArticleFormats;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class GenerateBlogPostCommand extends Command
{
    protected $signature = 'blog:generate
                            {--length=medium : Article length: short, medium, long, or random}
                            {--dry-run : Output topic and format without generating or saving}';

    protected $description = 'Generate a bi-weekly AI blog post about AutoCVApply for job seekers';

    public function handle(NanoGptService $nanoGpt, BlogArticleGenerationService $blogArticles): int
    {
        $this->info('Generating AutoCVApply blog post...');

        try {
            $lengthKey = BlogArticleFormats::resolveArticleLength((string) $this->option('length'));
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        Log::info('blog:generate started', [
            'length_key' => $lengthKey,
            'word_guidance' => BlogArticleFormats::articleBodyWordGuidance($lengthKey),
        ]);

        $format = $this->randomArticleFormat();
        $recentTitles = $this->recentBlogTitles();
        $topic = $this->generateTopic($nanoGpt, $format['name'], $recentTitles);

        $this->line("  Topic: {$topic}");
        $this->line('  Format: '.$format['name']);
        $this->line('  Length: '.$lengthKey.' ('.BlogArticleFormats::articleBodyWordGuidance($lengthKey).')');

        if ($this->option('dry-run')) {
            $this->newLine();
            $this->info('Dry run: no article or database write.');

            return self::SUCCESS;
        }

        $research = $this->buildResearchBrief($topic);

        $this->line('  Writing article...');
        $post = $blogArticles->generateFullArticle($topic, $research, $lengthKey, $format, function (string $stage, array $context = []): void {
            if ($stage === 'planning_start') {
                $this->line(sprintf(
                    '  Planning structure (%d sections, ~%d–%d words each)...',
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
                    '    → %d chars, ~%d words',
                    $context['content_chars'] ?? 0,
                    $context['content_words_approx'] ?? 0,
                ));
            }
        });

        $title = $this->normaliseDashes($post['title']);
        $body = $this->normaliseDashes($post['body']);
        $excerpt = $this->normaliseDashes($post['excerpt']);
        $tags = array_values(array_unique(array_merge(
            ['autocvapply', 'job-search', 'careers'],
            array_map(fn (string $tag): string => $this->normaliseDashes($tag), $post['tags'] ?? []),
        )));
        $sources = $this->normaliseDashesInSources($post['sources'] ?? []);
        $slug = $this->uniqueSlug(Str::slug($title));

        Blog::create([
            'title' => $title,
            'slug' => $slug,
            'excerpt' => $excerpt,
            'body' => $body,
            'image_url' => null,
            'tags' => $tags,
            'sources' => $sources,
            'status' => BlogStatus::Published,
            'published_at' => now(),
        ]);

        $this->newLine();
        $this->info("Published: {$title}");
        $this->line("  Slug: {$slug}");
        $this->line('  Tags: '.implode(', ', $tags));
        $this->line('  URL: '.route('blog.show', $slug));

        return self::SUCCESS;
    }

    /**
     * @return array{key: string, name: string, hint: string, title_pattern: string}
     */
    protected function randomArticleFormat(): array
    {
        $formats = BlogArticleFormats::all();

        return $formats[array_rand($formats)];
    }

    protected function buildResearchBrief(string $topic): string
    {
        $context = AutoCVApplyBlogContext::document();

        return "## Article topic\n{$topic}\n\n## Authoritative AutoCVApply context (ground truth only)\n\n{$context}";
    }

    /**
     * @param  array<int, string>  $recentTitles
     */
    protected function generateTopic(NanoGptService $nanoGpt, string $formatName, array $recentTitles): string
    {
        $today = now()->format('jS F Y');
        $angle = BlogArticleFormats::topicAngles()[array_rand(BlogArticleFormats::topicAngles())];
        $contextBlock = AutoCVApplyBlogContext::document();
        $avoidSection = '';

        if ($recentTitles !== []) {
            $list = implode("\n", array_map(fn (string $t): string => "- {$t}", $recentTitles));
            $avoidSection = "\n\nRecently published titles - do NOT overlap in angle or wording:\n{$list}";
        }

        $system = 'You are a content strategist for AutoCVApply (autocvapply.com). '
            .'Suggest one specific blog topic for UK job seekers. Emphasise benefits, time saved, reduced errors, and honest product facts. '
            ."Format: {$formatName}. Return only the topic as one short sentence.{$avoidSection}";

        $user = "Authoritative context:\n\n{$contextBlock}\n\n---\nToday is {$today}.\nFocus area: {$angle}";

        $maxAttempts = 3;
        $lastException = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $topic = trim((string) $nanoGpt->chat([
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ], ['temperature' => 0.7]));

                if ($topic === '') {
                    throw new \RuntimeException('Topic generation returned empty text.');
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

        throw $lastException ?? new \RuntimeException('Topic generation failed.');
    }

    /**
     * @return array<int, string>
     */
    protected function recentBlogTitles(int $limit = 20): array
    {
        return Blog::query()
            ->latest('published_at')
            ->limit($limit)
            ->pluck('title')
            ->toArray();
    }

    protected function uniqueSlug(string $base): string
    {
        $slug = $base;
        $attempt = 0;

        while (Blog::where('slug', $slug)->exists()) {
            $attempt++;
            $slug = $base.'-'.$attempt;
        }

        return $slug;
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
