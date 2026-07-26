<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Support\BlogCompetitorComparisons;
use Illuminate\Console\Command;

/**
 * Upsert AutoCVApply vs competitor comparison posts (draft by default).
 *
 * After review: php artisan blog:publish --limit=10
 * Or seed published: php artisan blog:seed-competitor-comparisons --publish
 */
class SeedCompetitorComparisonBlogsCommand extends Command
{
    protected $signature = 'blog:seed-competitor-comparisons
                            {--only= : Seed a single comparison id (e.g. lazyapply, autoapplymax)}
                            {--publish : Create/update as published instead of draft}
                            {--dry-run : Show planned posts without writing}';

    protected $description = 'Upsert curated AutoCVApply vs competitor comparison blog posts';

    public function handle(): int
    {
        $only = strtolower(trim((string) $this->option('only')));
        $publish = (bool) $this->option('publish');
        $dryRun = (bool) $this->option('dry-run');

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

        $this->info('Seeding '.count($definitions).' competitor comparison post(s) as '.($publish ? 'published' : 'draft').'...');

        $created = 0;
        $updated = 0;

        foreach ($definitions as $definition) {
            $post = BlogCompetitorComparisons::toPost($definition);
            $existing = Blog::query()->where('slug', $post['slug'])->first();

            $this->line(($existing ? 'Update' : 'Create').': '.$post['slug']);
            $this->line('  '.$post['title']);

            if ($dryRun) {
                continue;
            }

            $payload = [
                'title' => $post['title'],
                'slug' => $post['slug'],
                'excerpt' => $post['excerpt'],
                'body' => $post['body'],
                'tags' => $post['tags'],
                'sources' => [
                    [
                        'title' => 'AutoCVApply',
                        'url' => 'https://autocvapply.com',
                        'description' => 'Official product site.',
                    ],
                    [
                        'title' => 'AutoCVApply pricing',
                        'url' => 'https://autocvapply.com/pricing',
                        'description' => 'Current plan and credit allowances.',
                    ],
                ],
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

        return self::SUCCESS;
    }
}
