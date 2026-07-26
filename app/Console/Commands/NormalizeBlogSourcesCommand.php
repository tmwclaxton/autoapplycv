<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Support\BlogSourceNormalizer;
use Illuminate\Console\Command;

class NormalizeBlogSourcesCommand extends Command
{
    protected $signature = 'blog:normalize-sources
                            {--dry-run : Show planned changes without writing}
                            {--slug= : Limit to a single slug}';

    protected $description = 'Strip scraped markdown, image syntax, and dumped URLs from blog Sources & references blurbs';

    public function handle(): int
    {
        $query = Blog::query()->orderBy('id');

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        }

        $changed = 0;
        $skipped = 0;

        $query->chunkById(100, function ($posts) use (&$changed, &$skipped): void {
            foreach ($posts as $post) {
                $before = is_array($post->sources) ? $post->sources : [];
                $after = BlogSourceNormalizer::normalizeList($before);

                if (! BlogSourceNormalizer::listsDiffer($before, $after)) {
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

                foreach ($after as $index => $source) {
                    $oldDesc = (string) ($before[$index]['description'] ?? '');
                    $newDesc = $source['description'];
                    if ($oldDesc === $newDesc) {
                        continue;
                    }
                    $this->line('  '.$source['title']);
                    $this->line('    from: '.mb_substr($oldDesc, 0, 80).(mb_strlen($oldDesc) > 80 ? '...' : ''));
                    $this->line('      to: '.($newDesc !== '' ? $newDesc : '(empty)'));
                }

                if ($this->option('dry-run')) {
                    continue;
                }

                $post->update(['sources' => $after]);
            }
        });

        if ($changed === 0) {
            $this->info('No blog sources needed normalization.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            '%s %d post(s); %d unchanged.',
            $this->option('dry-run') ? 'Would update' : 'Updated',
            $changed,
            $skipped,
        ));

        return self::SUCCESS;
    }
}
