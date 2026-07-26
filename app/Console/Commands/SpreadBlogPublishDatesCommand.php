<?php

namespace App\Console\Commands;

use App\Enums\BlogStatus;
use App\Models\Blog;
use Carbon\CarbonInterface;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class SpreadBlogPublishDatesCommand extends Command
{
    protected $signature = 'blog:spread-publish-dates
                            {--months=4 : Months to spread publish dates over (ending now)}
                            {--dry-run : Show planned dates without writing}';

    protected $description = 'Spread published blog dates evenly across recent months with light jitter';

    public function handle(): int
    {
        $months = (int) $this->option('months');
        if ($months < 1) {
            $this->error('--months must be at least 1.');

            return self::FAILURE;
        }

        $posts = Blog::query()
            ->where('status', BlogStatus::Published)
            ->whereNotNull('published_at')
            ->orderBy('id')
            ->get(['id', 'slug', 'title', 'published_at']);

        if ($posts->isEmpty()) {
            $this->info('No published posts to update.');

            return self::SUCCESS;
        }

        $end = now()->seconds(0)->microseconds(0);
        $start = $end->copy()->subMonthsNoOverflow($months);
        $dates = $this->spreadDates($posts->count(), $start, $end);

        $beforeMin = $posts->min('published_at');
        $beforeMax = $posts->max('published_at');

        $this->info(sprintf(
            'Window: %s -> %s (%d month(s), %d post(s))',
            $start->toDateTimeString(),
            $end->toDateTimeString(),
            $months,
            $posts->count(),
        ));
        $this->info(sprintf(
            'Before range: %s -> %s',
            $beforeMin?->toDateTimeString() ?? 'n/a',
            $beforeMax?->toDateTimeString() ?? 'n/a',
        ));

        foreach ($posts->values() as $index => $post) {
            $next = $dates[$index];
            $this->line(sprintf(
                '  #%d %s  %s -> %s',
                $post->id,
                $post->slug,
                $post->published_at?->toDateTimeString() ?? 'null',
                $next->toDateTimeString(),
            ));
        }

        if ($this->option('dry-run')) {
            $this->info('Dry run: no dates were written.');

            return self::SUCCESS;
        }

        foreach ($posts->values() as $index => $post) {
            $post->published_at = $dates[$index];
            $post->save();
        }

        $after = Blog::query()
            ->where('status', BlogStatus::Published)
            ->whereNotNull('published_at')
            ->orderBy('published_at')
            ->get(['published_at']);

        $this->info(sprintf(
            'Updated %d post(s). After range: %s -> %s',
            $posts->count(),
            $after->first()?->published_at?->toDateTimeString() ?? 'n/a',
            $after->last()?->published_at?->toDateTimeString() ?? 'n/a',
        ));

        return self::SUCCESS;
    }

    /**
     * Evenly space timestamps across [start, end], add light jitter, then sort so
     * older ids keep earlier dates while the series does not look perfectly linear.
     *
     * @return list<Carbon>
     */
    public function spreadDates(int $count, CarbonInterface $start, CarbonInterface $end): array
    {
        if ($count < 1) {
            return [];
        }

        $startTs = $start->getTimestamp();
        $endTs = $end->getTimestamp();
        if ($endTs < $startTs) {
            [$startTs, $endTs] = [$endTs, $startTs];
        }

        $span = max(0, $endTs - $startTs);
        $ideal = [];

        if ($count === 1) {
            $ideal[] = (int) round($startTs + ($span / 2));
        } else {
            for ($i = 0; $i < $count; $i++) {
                $ideal[] = (int) round($startTs + (($span * $i) / ($count - 1)));
            }
        }

        $slot = $count > 1 ? (int) max(1, intdiv($span, $count - 1)) : max(1, $span);
        $jitter = (int) max(60, min((int) floor($slot * 0.35), 12 * 3600));

        $jittered = [];
        foreach ($ideal as $ts) {
            $offset = random_int(-$jitter, $jitter);
            $jittered[] = max($startTs, min($endTs, $ts + $offset));
        }

        sort($jittered);

        return $this->ensureUniqueTimestamps($jittered, $startTs, $endTs)
            ->map(fn (int $ts): Carbon => Carbon::createFromTimestamp($ts))
            ->all();
    }

    /**
     * @param  list<int>  $timestamps
     * @return Collection<int, int>
     */
    private function ensureUniqueTimestamps(array $timestamps, int $startTs, int $endTs): Collection
    {
        $unique = [];
        $used = [];

        foreach ($timestamps as $ts) {
            $candidate = max($startTs, min($endTs, $ts));
            while (isset($used[$candidate]) && $candidate < $endTs) {
                $candidate++;
            }
            while (isset($used[$candidate]) && $candidate > $startTs) {
                $candidate--;
            }
            if (isset($used[$candidate])) {
                throw new \RuntimeException('Unable to assign unique publish timestamps within the window.');
            }
            $used[$candidate] = true;
            $unique[] = $candidate;
        }

        sort($unique);

        return collect($unique);
    }
}
