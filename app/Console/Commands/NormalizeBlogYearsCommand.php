<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Support\BlogYearNormalizer;
use Illuminate\Console\Command;
use InvalidArgumentException;

class NormalizeBlogYearsCommand extends Command
{
    protected $signature = 'blog:normalize-years
                            {--to=2026 : Target year for title year tokens}
                            {--dry-run : Show planned changes without writing}
                            {--slug= : Limit to a single slug}';

    protected $description = 'Replace outdated year tokens in blog titles with the target year (titles only; slugs and bodies unchanged)';

    public function handle(): int
    {
        $toYear = (int) $this->option('to');

        try {
            BlogYearNormalizer::normalizeTitle('probe 2025', $toYear);
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $query = Blog::query()->orderBy('id');

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        }

        $changed = 0;
        $skipped = 0;

        $query->chunkById(100, function ($posts) use ($toYear, &$changed, &$skipped): void {
            foreach ($posts as $post) {
                $from = (string) $post->title;
                $to = BlogYearNormalizer::normalizeTitle($from, $toYear);

                if ($to === $from) {
                    $skipped++;

                    continue;
                }

                $changed++;
                $this->line(sprintf(
                    '#%d %s %s',
                    $post->id,
                    $post->slug,
                    $this->option('dry-run') ? '(dry-run)' : '',
                ));
                $this->line('  from: '.$from);
                $this->line('    to: '.$to);

                if ($this->option('dry-run')) {
                    continue;
                }

                $post->update(['title' => $to]);
            }
        });

        if ($changed === 0) {
            $this->info('No blog titles needed year normalization.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            '%s %d title(s); %d unchanged.',
            $this->option('dry-run') ? 'Would update' : 'Updated',
            $changed,
            $skipped,
        ));

        return self::SUCCESS;
    }
}
