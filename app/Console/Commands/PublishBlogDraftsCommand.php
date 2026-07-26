<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use Illuminate\Console\Command;

/**
 * Publish oldest draft blogs in batches after smoke review.
 *
 * Typical run order:
 * 1. blog:import-competitor-topics --refresh-manifest --limit=10
 * 2. Spot-check 2-3 drafts
 * 3. blog:publish --limit=10
 * 4. blog:expand-published (existing live posts, once)
 * 5. Weekly: blog:generate --length=long
 */
class PublishBlogDraftsCommand extends Command
{
    protected $signature = 'blog:publish
                            {--limit=10 : Max drafts to publish}
                            {--slug= : Publish a single draft by slug}
                            {--dry-run : List drafts that would be published}';

    protected $description = 'Publish oldest blog drafts (set status=published and published_at)';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $slug = trim((string) $this->option('slug'));

        $query = Blog::query()
            ->where('status', BlogStatus::Draft)
            ->orderBy('id');

        if ($slug !== '') {
            $query->where('slug', $slug);
        }

        $drafts = $query->limit($limit)->get();

        if ($drafts->isEmpty()) {
            $this->info('No drafts to publish.');

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            foreach ($drafts as $blog) {
                $this->line("  #{$blog->id} {$blog->slug} - {$blog->title}");
            }
            $this->info('Dry run: '.$drafts->count().' draft(s) would be published.');

            return self::SUCCESS;
        }

        $published = 0;
        foreach ($drafts as $blog) {
            $blog->update([
                'status' => BlogStatus::Published,
                'published_at' => $blog->published_at ?? now(),
            ]);
            $this->line("Published #{$blog->id}: {$blog->title}");
            $published++;
        }

        $this->info("Published {$published} draft(s).");

        return self::SUCCESS;
    }
}
