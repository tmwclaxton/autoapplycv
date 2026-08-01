<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\CompetitorComparisonArticleService;
use App\Support\BlogCompetitorComparisons;
use Illuminate\Console\Command;

/**
 * Upsert AutoCVApply vs competitor comparison posts (draft by default).
 *
 * After review: php artisan blog:publish --limit=10
 *
 * Refresh published bodies locally / on prod (keeps search-intent slugs):
 *   php artisan blog:seed-competitor-comparisons --publish
 *   php artisan blog:seed-competitor-comparisons --only=applyglide --publish
 *   php artisan blog:seed-competitor-comparisons --ai --refresh-research --only=applyglide --publish
 *
 * Do not deploy unless explicitly asked - run the artisan command on the target environment.
 */
class SeedCompetitorComparisonBlogsCommand extends Command
{
    protected $signature = 'blog:seed-competitor-comparisons
                            {--only= : Seed a single comparison id (e.g. lazyapply, autoapplymax)}
                            {--publish : Create/update as published instead of draft}
                            {--ai : Rewrite bodies with NanoGPT using crawl briefs + product context}
                            {--refresh-research : Live Firecrawl scrape of competitor pages before AI rewrite (implies --ai)}
                            {--dry-run : Show planned posts without writing}';

    protected $description = 'Upsert curated AutoCVApply vs competitor comparison blog posts';

    public function handle(CompetitorComparisonArticleService $articles): int
    {
        $only = strtolower(trim((string) $this->option('only')));
        $publish = (bool) $this->option('publish');
        $dryRun = (bool) $this->option('dry-run');
        $refreshResearch = (bool) $this->option('refresh-research');
        $useAi = (bool) $this->option('ai') || $refreshResearch;

        $definitions = BlogCompetitorComparisons::definitions();
        if ($only !== '') {
            $definitions = array_values(array_filter(
                $definitions,
                fn (array $row): bool => $row['id'] === $only,
            ));
            if ($definitions === []) {
                $valid = implode(', ', array_column(BlogCompetitorComparisons::definitions(), 'id'));
                $this->error("Unknown --only={$only}. Valid ids: {$valid}");

                return self::FAILURE;
            }
        }

        $mode = $publish ? 'published' : 'draft';
        $aiNote = $useAi ? ($refreshResearch ? ' (AI + live Firecrawl)' : ' (AI from curated briefs)') : '';
        $this->info('Seeding '.count($definitions)." competitor comparison post(s) as {$mode}{$aiNote}...");

        $created = 0;
        $updated = 0;

        foreach ($definitions as $definition) {
            $post = $articles->buildPost($definition, $useAi, $refreshResearch);
            $existing = Blog::query()->where('slug', $post['slug'])->first();

            $this->line(($existing ? 'Update' : 'Create').': '.$post['slug']);
            $this->line('  '.$post['title']);
            $this->line('  body chars: '.mb_strlen($post['body']));

            if ($dryRun) {
                continue;
            }

            $payload = [
                'title' => $post['title'],
                'slug' => $post['slug'],
                'excerpt' => $post['excerpt'],
                'body' => $post['body'],
                'tags' => $post['tags'],
                'sources' => $post['sources'],
                'status' => $publish ? BlogStatus::Published : BlogStatus::Draft,
                'published_at' => $publish
                    ? ($existing?->published_at ?? now())
                    : null,
            ];

            if ($existing !== null) {
                // Keep an existing published status unless --publish is set;
                // drafts stay drafts on re-seed unless publishing.
                if (! $publish && $existing->status === BlogStatus::Published) {
                    $payload['status'] = BlogStatus::Published;
                    $payload['published_at'] = $existing->published_at ?? now();
                }
                $existing->update($payload);
                $updated++;
            } else {
                Blog::create($payload);
                $created++;
            }
        }

        if ($dryRun) {
            $this->info('Dry run: no database writes.');

            return self::SUCCESS;
        }

        $this->info("Created {$created}, updated {$updated}.");
        if (! $publish) {
            $this->line('Next: spot-check drafts, then blog:publish --limit=10');
        }
        $this->line('Prod refresh (when ready): php artisan blog:seed-competitor-comparisons --publish');

        return self::SUCCESS;
    }
}
