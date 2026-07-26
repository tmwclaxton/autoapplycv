<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Support\BlogTldrPlacement;
use Illuminate\Console\Command;

class ReorderBlogTldrCommand extends Command
{
    protected $signature = 'blog:reorder-tldr
                            {--dry-run : Show which posts would change without writing}
                            {--published-only : Only published posts (default)}
                            {--all : Include drafts as well}
                            {--slug= : Limit to a single slug}';

    protected $description = 'Move ## TL;DR sections near the bottom of blog bodies (before FAQ / Get started)';

    public function handle(): int
    {
        $query = Blog::query()->orderBy('id');

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        } elseif (! $this->option('all')) {
            $query->where('status', BlogStatus::Published);
        }

        $posts = $query->get(['id', 'slug', 'title', 'body', 'status']);

        if ($posts->isEmpty()) {
            $this->info('No blog posts matched.');

            return self::SUCCESS;
        }

        $changed = 0;
        $skipped = 0;

        foreach ($posts as $post) {
            $body = (string) $post->body;
            $reordered = BlogTldrPlacement::moveNearBottom($body);

            if (trim($reordered) === trim($body)) {
                $skipped++;

                continue;
            }

            $changed++;
            $this->line(sprintf('  #%d %s', $post->id, $post->slug));

            if (! $this->option('dry-run')) {
                $post->body = $reordered;
                $post->save();
            }
        }

        if ($this->option('dry-run')) {
            $this->info(sprintf('Dry run: %d would update, %d already placed.', $changed, $skipped));
        } else {
            $this->info(sprintf('Updated %d post(s); %d already placed.', $changed, $skipped));
        }

        return self::SUCCESS;
    }
}
