<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Support\BlogYearNormalizer;
use Illuminate\Console\Command;
use InvalidArgumentException;

class NormalizeBlogYearsCommand extends Command
{
    protected $signature = 'blog:normalize-years
                            {--to=2026 : Target year for year tokens}
                            {--dry-run : Show planned changes without writing}
                            {--slug= : Limit to a single slug}';

    protected $description = 'Replace outdated year tokens in blog titles, bodies, and excerpts with the target year (slugs unchanged)';

    public function handle(): int
    {
        $toYear = (int) $this->option('to');

        try {
            BlogYearNormalizer::normalizeTitle('probe 2025', $toYear);
            BlogYearNormalizer::normalizeContent('probe 2025', $toYear);
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $query = Blog::query()->orderBy('id');

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        }

        $titlesChanged = 0;
        $bodiesChanged = 0;
        $excerptsChanged = 0;
        $postsTouched = 0;
        $skipped = 0;

        $query->chunkById(100, function ($posts) use (
            $toYear,
            &$titlesChanged,
            &$bodiesChanged,
            &$excerptsChanged,
            &$postsTouched,
            &$skipped,
        ): void {
            foreach ($posts as $post) {
                $updates = [];

                $fromTitle = (string) $post->title;
                $toTitle = BlogYearNormalizer::normalizeTitle($fromTitle, $toYear);
                if ($toTitle !== $fromTitle) {
                    $updates['title'] = $toTitle;
                }

                $fromBody = (string) ($post->body ?? '');
                $toBody = BlogYearNormalizer::normalizeContent($fromBody, $toYear);
                if ($toBody !== $fromBody) {
                    $updates['body'] = $toBody;
                }

                $fromExcerpt = (string) ($post->excerpt ?? '');
                $toExcerpt = BlogYearNormalizer::normalizeContent($fromExcerpt, $toYear);
                if ($toExcerpt !== $fromExcerpt) {
                    $updates['excerpt'] = $toExcerpt;
                }

                if ($updates === []) {
                    $skipped++;

                    continue;
                }

                $postsTouched++;
                if (isset($updates['title'])) {
                    $titlesChanged++;
                }
                if (isset($updates['body'])) {
                    $bodiesChanged++;
                }
                if (isset($updates['excerpt'])) {
                    $excerptsChanged++;
                }

                $this->line(sprintf(
                    '#%d %s %s',
                    $post->id,
                    $post->slug,
                    $this->option('dry-run') ? '(dry-run)' : '',
                ));

                if (isset($updates['title'])) {
                    $this->line('  title from: '.$fromTitle);
                    $this->line('         to: '.$toTitle);
                }
                if (isset($updates['excerpt'])) {
                    $this->line(sprintf(
                        '  excerpt: %d -> %d char(s); years rewritten',
                        strlen((string) $fromExcerpt),
                        strlen((string) $toExcerpt),
                    ));
                }
                if (isset($updates['body'])) {
                    $this->line(sprintf(
                        '  body: %d -> %d char(s); years rewritten',
                        strlen((string) $fromBody),
                        strlen((string) $toBody),
                    ));
                }

                if ($this->option('dry-run')) {
                    continue;
                }

                $post->update($updates);
            }
        });

        if ($postsTouched === 0) {
            $this->info('No blog posts needed year normalization.');

            return self::SUCCESS;
        }

        $verb = $this->option('dry-run') ? 'Would update' : 'Updated';
        $this->info(sprintf(
            '%s %d post(s): %d title(s), %d body(ies), %d excerpt(s); %d unchanged.',
            $verb,
            $postsTouched,
            $titlesChanged,
            $bodiesChanged,
            $excerptsChanged,
            $skipped,
        ));

        return self::SUCCESS;
    }
}
