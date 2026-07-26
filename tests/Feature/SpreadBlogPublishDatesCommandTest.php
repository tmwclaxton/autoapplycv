<?php

namespace Tests\Feature;

use App\Console\Commands\SpreadBlogPublishDatesCommand;
use App\Enums\BlogStatus;
use App\Models\Blog;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SpreadBlogPublishDatesCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_spreads_published_dates_within_window_with_unique_timestamps(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-26 12:00:00', 'UTC'));

        $posts = collect([
            Blog::factory()->published()->create([
                'published_at' => now()->subDay(),
                'slug' => 'post-a',
            ]),
            Blog::factory()->published()->create([
                'published_at' => now()->subDay(),
                'slug' => 'post-b',
            ]),
            Blog::factory()->published()->create([
                'published_at' => now()->subDay(),
                'slug' => 'post-c',
            ]),
            Blog::factory()->published()->create([
                'published_at' => now()->subDay(),
                'slug' => 'post-d',
            ]),
            Blog::factory()->published()->create([
                'published_at' => now()->subDay(),
                'slug' => 'post-e',
            ]),
        ]);

        $draft = Blog::factory()->create([
            'status' => BlogStatus::Draft,
            'published_at' => null,
            'slug' => 'draft-post',
        ]);

        $this->artisan('blog:spread-publish-dates', ['--months' => 3])
            ->assertSuccessful();

        $windowStart = now()->subMonthsNoOverflow(3);
        $windowEnd = now();
        $dates = [];

        $expectedSlugs = ['post-a', 'post-b', 'post-c', 'post-d', 'post-e'];

        foreach ($posts->values() as $index => $post) {
            $post->refresh();
            $this->assertSame($expectedSlugs[$index], $post->slug);
            $this->assertNotNull($post->published_at);
            $this->assertTrue(
                $post->published_at->betweenIncluded($windowStart, $windowEnd),
                "published_at {$post->published_at} outside window",
            );
            $dates[] = $post->published_at->timestamp;
        }

        $this->assertSame(count($dates), count(array_unique($dates)));

        $ordered = Blog::query()
            ->where('status', BlogStatus::Published)
            ->orderBy('id')
            ->pluck('published_at')
            ->map(fn ($d) => $d->timestamp)
            ->all();
        $sorted = $ordered;
        sort($sorted);
        $this->assertSame($sorted, $ordered);

        $draft->refresh();
        $this->assertSame(BlogStatus::Draft, $draft->status);
        $this->assertNull($draft->published_at);
        $this->assertSame('draft-post', $draft->slug);

        $this->assertSame('post-a', $posts[0]->fresh()->slug);
    }

    public function test_dry_run_does_not_write(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-26 12:00:00', 'UTC'));

        $original = now()->subDays(2);
        $blog = Blog::factory()->published()->create([
            'published_at' => $original,
            'slug' => 'keep-date',
        ]);

        $this->artisan('blog:spread-publish-dates', [
            '--months' => 4,
            '--dry-run' => true,
        ])->assertSuccessful();

        $blog->refresh();
        $this->assertTrue($blog->published_at->equalTo($original));
        $this->assertSame('keep-date', $blog->slug);
    }

    public function test_rejects_invalid_months(): void
    {
        $this->artisan('blog:spread-publish-dates', ['--months' => 0])
            ->assertFailed();
    }

    public function test_spread_dates_helper_returns_unique_sorted_values(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-26 12:00:00', 'UTC'));

        $command = app(SpreadBlogPublishDatesCommand::class);
        $start = now()->subMonthsNoOverflow(4);
        $end = now();

        $dates = $command->spreadDates(8, $start, $end);

        $this->assertCount(8, $dates);
        $timestamps = array_map(fn (CarbonInterface $d) => $d->timestamp, $dates);
        $this->assertSame(count($timestamps), count(array_unique($timestamps)));

        $sorted = $timestamps;
        sort($sorted);
        $this->assertSame($sorted, $timestamps);

        foreach ($dates as $date) {
            $this->assertTrue($date->betweenIncluded($start, $end));
        }
    }
}
