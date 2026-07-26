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
use App\Support\BlogTitleDiversify;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Expand the live catalog posts to AutoApplyMax-style pillar length (TL;DR + FAQ + soft CTA).
 *
 * Prefer re-running this command over shipping huge body blobs in migrations.
 */
class ExpandPublishedBlogPostsCommand extends Command
{
    protected $signature = 'blog:expand-published
                            {--limit=6 : Max published posts to expand}
                            {--slug= : Expand a single slug}
                            {--length=pillar : Article length preset}
                            {--new-slug : Allow slug to change when the title changes}
                            {--skip-image : Skip hero image regeneration (keep existing)}
                            {--dry-run : Show targets without regenerating}';

    protected $description = 'Regenerate published catalog posts to pillar length with search-intent structure';

    /**
     * @return array<string, array{topic: string, title: string, cluster: string}>
     */
    public static function expandSeedsByTopic(): array
    {
        return [
            'what-is-autocvapply' => [
                'topic' => 'What is AutoCVApply? Chrome extension for CV autofill and LinkedIn auto apply explained',
                'title' => 'What is AutoCVApply? CV Autofill and Auto Apply Explained (2026)',
                'cluster' => 'autofill-extensions-comparison',
            ],
            'workday-autofill' => [
                'topic' => 'How to autofill Workday job applications without retyping your CV (2026)',
                'title' => 'How to Autofill Workday Job Applications Without Retyping Your CV (2026)',
                'cluster' => 'ats-workday-forms',
            ],
            'linkedin-auto-apply' => [
                'topic' => 'How to auto apply on LinkedIn Easy Apply safely in 2026',
                'title' => 'How to Auto Apply on LinkedIn Easy Apply (2026)',
                'cluster' => 'linkedin-auto-apply',
            ],
            'graduate-volume' => [
                'topic' => 'How graduates can apply to schemes at volume without rebuilding every form',
                'title' => 'Graduate Scheme Applications at Volume Without Rebuilding Every Form',
                'cluster' => 'job-search-strategy',
            ],
            'contractor-between-gigs' => [
                'topic' => 'How contractors keep one CV profile warm between gigs across employer portals',
                'title' => 'Between Contracts: Keep One CV Profile Warm Across Employer Portals',
                'cluster' => 'ats-workday-forms',
            ],
            'autofill-control-myth' => [
                'topic' => 'Is job application autofill a silent bot? What you still control',
                'title' => 'Is Job Application Autofill a Silent Bot? What You Still Control',
                'cluster' => 'autofill-job-applications',
            ],
        ];
    }

    public function handle(
        NanoGptService $nanoGpt,
        BlogArticleGenerationService $blogArticles,
        NanoGptBlogHeroImageService $heroImages,
        FirecrawlService $firecrawl,
    ): int {
        try {
            $lengthKey = BlogArticleFormats::resolveArticleLength((string) $this->option('length'));
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $targets = $this->resolveTargets();
        if ($targets === []) {
            $this->warn('No published catalog posts matched.');

            return self::SUCCESS;
        }

        $this->info('Expanding '.count($targets).' published post(s) to '.$lengthKey.'...');

        if ($this->option('dry-run')) {
            foreach ($targets as $row) {
                $this->line('  #'.$row['blog']->id.' '.$row['blog']->slug.' => '.$row['seed']['title']);
            }
            $this->info('Dry run: no generation.');

            return self::SUCCESS;
        }

        $format = [
            'key' => 'how-to',
            'name' => 'How-to guide',
            'hint' => 'Long practical SEO article with TL;DR, when/when-not, FAQ, soft CTA.',
            'title_pattern' => 'How to… / search-intent',
        ];

        $updated = 0;
        foreach ($targets as $row) {
            /** @var Blog $blog */
            $blog = $row['blog'];
            $seed = $row['seed'];
            $topic = $seed['topic'];

            $this->newLine();
            $this->info("Expanding #{$blog->id} ({$blog->slug})");
            $this->line('  Topic: '.$topic);

            try {
                $seoTarget = BlogKeywordStrategy::targetForCluster($seed['cluster']);
                $researchSources = [];
                try {
                    $researchSources = $firecrawl->search($seoTarget['primary'].' '.$topic, 8);
                } catch (Throwable $e) {
                    $this->warn('  Firecrawl search failed; continuing.');
                }

                $research = "## Article topic\n{$topic}\n\n"
                    ."## Expansion brief\n"
                    ."Preferred title: {$seed['title']}\n"
                    ."Current title: {$blog->title}\n"
                    ."Current excerpt: {$blog->excerpt}\n"
                    ."Expand to pillar depth with TL;DR, practical sections, FAQ, soft AutoCVApply CTA.\n"
                    ."Keep product honesty from AutoCVApply ground truth.\n\n"
                    .BlogKeywordStrategy::promptBlock($seoTarget)."\n\n"
                    .FirecrawlService::formatSourcesForPrompt($researchSources)."\n\n"
                    ."## Authoritative AutoCVApply context\n\n"
                    .AutoCVApplyBlogContext::document();

                $imagePath = $blog->getRawOriginal('image_url');
                if (! $this->option('skip-image')) {
                    $this->line('  Generating hero image...');
                    $generated = $heroImages->generateAndStore($heroImages->buildPrompt($nanoGpt, $topic));
                    if ($generated) {
                        $imagePath = $generated;
                    }
                } else {
                    $this->line('  Keeping existing hero image.');
                }

                $this->line('  Writing article...');
                $post = $blogArticles->generateFullArticle(
                    $topic,
                    $research,
                    $lengthKey,
                    $format,
                    function (string $stage, array $context = []): void {
                        if ($stage === 'plan_complete') {
                            $this->line('  Planned: '.mb_substr((string) ($context['title'] ?? ''), 0, 90));
                        }
                    },
                    $seoTarget,
                );

                $title = $this->normaliseDashes($seed['title'] !== '' ? $seed['title'] : $post['title']);
                $keepSlug = ! (bool) $this->option('new-slug');
                $slug = $keepSlug ? $blog->slug : $this->uniqueSlug(Str::slug($title), $blog->id);

                $tags = array_values(array_unique(array_merge(
                    BlogKeywordStrategy::tagsForTarget($seoTarget),
                    array_map(fn (string $t): string => $this->normaliseDashes($t), $post['tags'] ?? []),
                    $blog->tags ?? [],
                    [$seoTarget['id'], $row['topic_key']],
                )));

                $sources = FirecrawlService::selectSourcesForArticle($researchSources, $post['sources'] ?? []);

                $blog->update([
                    'title' => $title,
                    'slug' => $slug,
                    'excerpt' => $this->normaliseDashes($post['excerpt']),
                    'body' => $this->normaliseDashes($post['body']),
                    'image_url' => $imagePath,
                    'tags' => $tags,
                    'sources' => $sources,
                    'status' => BlogStatus::Published,
                    'published_at' => $blog->published_at ?? now(),
                ]);

                $this->info('  Updated: '.$blog->fresh()->title);
                $updated++;
            } catch (Throwable $e) {
                Log::warning('blog:expand-published failed', [
                    'blog_id' => $blog->id,
                    'message' => $e->getMessage(),
                ]);
                $this->error('  Failed: '.$e->getMessage());
            }
        }

        $this->newLine();
        $this->info("Expanded {$updated} post(s).");

        return self::SUCCESS;
    }

    /**
     * @return array<int, array{blog: Blog, topic_key: string, seed: array{topic: string, title: string, cluster: string}}>
     */
    protected function resolveTargets(): array
    {
        $slugFilter = trim((string) $this->option('slug'));
        $limit = max(1, (int) $this->option('limit'));
        $seeds = self::expandSeedsByTopic();
        $aliasToTopic = [];
        foreach (BlogTitleDiversify::slugAliasesByTopic() as $topic => $aliases) {
            foreach ($aliases as $alias) {
                $aliasToTopic[$alias] = $topic;
            }
            $aliasToTopic[Str::slug($seeds[$topic]['title'] ?? $topic)] = $topic;
            $canonical = BlogTitleDiversify::canonicalByTopic()[$topic] ?? null;
            if (is_array($canonical)) {
                $aliasToTopic[Str::slug($canonical['title'])] = $topic;
            }
            $aliasToTopic[$topic] = $topic;
        }

        $query = Blog::query()->published()->orderBy('id');
        if ($slugFilter !== '') {
            $query->where('slug', $slugFilter);
        }

        $targets = [];
        foreach ($query->get() as $blog) {
            $topicKey = $aliasToTopic[$blog->slug] ?? null;
            if ($topicKey === null || ! isset($seeds[$topicKey])) {
                continue;
            }
            $targets[] = [
                'blog' => $blog,
                'topic_key' => $topicKey,
                'seed' => $seeds[$topicKey],
            ];
            if (count($targets) >= $limit) {
                break;
            }
        }

        return $targets;
    }

    protected function uniqueSlug(string $base, ?int $ignoreId = null): string
    {
        $slug = $base !== '' ? $base : 'blog-post';
        $candidate = $slug;
        $i = 2;
        while (true) {
            $exists = Blog::query()
                ->where('slug', $candidate)
                ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
                ->exists();
            if (! $exists) {
                return $candidate;
            }
            $candidate = $slug.'-'.$i;
            $i++;
        }
    }

    protected function normaliseDashes(string $text): string
    {
        return str_replace(["\u{2014}", "\u{2013}"], '-', $text);
    }
}
