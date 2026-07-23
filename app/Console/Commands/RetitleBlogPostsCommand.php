<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Support\BlogTitleDiversify;
use Illuminate\Console\Command;

class RetitleBlogPostsCommand extends Command
{
    protected $signature = 'blog:retitle
                            {--dry-run : Show planned changes without writing}';

    protected $description = 'Rewrite curated blog catalog posts (title, excerpt, slug, body, tags)';

    public function handle(): int
    {
        $map = BlogTitleDiversify::byOldSlug();
        $changed = 0;
        $seen = [];

        foreach ($map as $oldSlug => $next) {
            $blog = Blog::query()->where('slug', $oldSlug)->first();
            if ($blog === null) {
                continue;
            }

            // One canonical rewrite per post even if multiple aliases match over time.
            if (isset($seen[$blog->id])) {
                continue;
            }
            $seen[$blog->id] = true;

            $slug = $this->uniqueSlug($next['slug'], $blog->id);
            $pinNewest = (bool) ($next['pin_newest'] ?? false);

            $this->line(sprintf(
                '#%d %s',
                $blog->id,
                $this->option('dry-run') ? '(dry-run)' : '',
            ));
            $this->line('  from: '.$blog->title);
            $this->line('    to: '.$next['title']);
            $this->line('  slug: '.$blog->slug.' -> '.$slug);
            if ($pinNewest) {
                $this->line('  pin: newest on the blog index');
            }

            if ($this->option('dry-run')) {
                $changed++;

                continue;
            }

            $payload = [
                'title' => $next['title'],
                'excerpt' => $next['excerpt'],
                'slug' => $slug,
                'body' => $next['body'],
                'tags' => $next['tags'],
            ];

            if ($pinNewest) {
                $payload['published_at'] = now();
            }

            $blog->update($payload);
            $changed++;
        }

        if ($changed === 0) {
            $this->warn('No matching blog slugs found to rewrite.');

            return self::SUCCESS;
        }

        $this->info(($this->option('dry-run') ? 'Would update ' : 'Updated ').$changed.' post(s).');

        return self::SUCCESS;
    }

    protected function uniqueSlug(string $base, int $ignoreId): string
    {
        $slug = $base;
        $attempt = 0;

        while (
            Blog::query()
                ->where('slug', $slug)
                ->where('id', '!=', $ignoreId)
                ->exists()
        ) {
            $attempt++;
            $slug = $base.'-'.$attempt;
        }

        return $slug;
    }
}
