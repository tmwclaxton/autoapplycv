<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SeedCompetitorComparisonBlogsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_does_not_write(): void
    {
        $this->artisan('blog:seed-competitor-comparisons', ['--dry-run' => true])
            ->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 0);
    }

    public function test_seed_creates_drafts_for_all_competitors(): void
    {
        $this->artisan('blog:seed-competitor-comparisons')->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 10);

        $blog = Blog::query()->where('slug', 'autocvapply-vs-lazyapply')->first();
        $this->assertNotNull($blog);
        $this->assertSame(BlogStatus::Draft, $blog->status);
        $this->assertNull($blog->published_at);
        $this->assertStringContainsString('## TL;DR', $blog->body);
        $this->assertContains('comparison', $blog->tags);
    }

    public function test_seed_only_and_publish_flags(): void
    {
        $this->artisan('blog:seed-competitor-comparisons', [
            '--only' => 'autoapplymax',
            '--publish' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 1);
        $blog = Blog::query()->first();
        $this->assertSame('autocvapply-vs-autoapplymax', $blog->slug);
        $this->assertSame(BlogStatus::Published, $blog->status);
        $this->assertNotNull($blog->published_at);
    }

    public function test_reseed_updates_existing_slug(): void
    {
        $this->artisan('blog:seed-competitor-comparisons', ['--only' => 'teal'])->assertExitCode(0);
        $blog = Blog::query()->where('slug', 'autocvapply-vs-teal')->firstOrFail();
        $blog->update(['excerpt' => 'stale']);

        $this->artisan('blog:seed-competitor-comparisons', ['--only' => 'teal'])->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 1);
        $blog->refresh();
        $this->assertNotSame('stale', $blog->excerpt);
        $this->assertStringContainsString('Teal', $blog->title);
    }
}
