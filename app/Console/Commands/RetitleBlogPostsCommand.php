<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Support\BlogKeywordStrategy;
use App\Support\BlogTitleDiversify;
use Illuminate\Console\Command;

class RetitleBlogPostsCommand extends Command
{
    protected $signature = 'blog:retitle
                            {--dry-run : Show planned title changes without writing}
                            {--force : Also rewrite titles that already look diversified}';

    protected $description = 'Rewrite formulaic blog titles/excerpts/slugs using the curated diversify map';

    public function handle(): int
    {
        $map = BlogTitleDiversify::byOldSlug();
        $changed = 0;

        foreach ($map as $oldSlug => $next) {
            $blog = Blog::query()->where('slug', $oldSlug)->first();
            if ($blog === null) {
                continue;
            }

            if (! $this->option('force') && ! BlogKeywordStrategy::titleLooksGeneric($blog->title)) {
                // Still allow rewrite when the old slug is in the map (explicit catalog fix).
            }

            $slug = $this->uniqueSlug($next['slug'], $blog->id);

            $this->line(sprintf(
                '#%d %s',
                $blog->id,
                $this->option('dry-run') ? '(dry-run)' : '',
            ));
            $this->line('  from: '.$blog->title);
            $this->line('    to: '.$next['title']);
            $this->line('  slug: '.$blog->slug.' -> '.$slug);

            if ($this->option('dry-run')) {
                $changed++;

                continue;
            }

            $blog->update([
                'title' => $next['title'],
                'excerpt' => $next['excerpt'],
                'slug' => $slug,
            ]);
            $changed++;
        }

        if ($changed === 0) {
            $this->warn('No matching blog slugs found to retitle.');

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
