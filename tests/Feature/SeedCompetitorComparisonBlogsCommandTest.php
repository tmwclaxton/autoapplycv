<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\FirecrawlService;
use App\Services\NanoGptService;
use App\Support\BlogCompetitorComparisons;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
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
        $this->assertStringContainsString('https://lazyapply.com', $blog->body);
        $this->assertContains('comparison', $blog->tags);
        $this->assertTrue(collect($blog->sources)->contains(
            fn (array $source): bool => str_contains((string) ($source['url'] ?? ''), 'lazyapply.com'),
        ));
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
        $this->assertStringContainsString('https://www.autoapplymax.com', $blog->body);
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
        $this->assertStringContainsString('### Feature matrix', $blog->body);
    }

    public function test_ai_flag_uses_nanogpt_when_body_validates(): void
    {
        $definition = collect(BlogCompetitorComparisons::definitions())
            ->firstWhere('id', 'applyglide');
        $this->assertNotNull($definition);

        $curated = BlogCompetitorComparisons::body($definition);
        $aiBody = str_replace(
            'Cloudflare 520 origin error at research time',
            'AI-REFRESHED Cloudflare 520 origin error at research time',
            $curated,
        );

        $this->mock(NanoGptService::class, function (MockInterface $mock) use ($aiBody): void {
            $mock->shouldReceive('chat')->once()->andReturn($aiBody);
        });

        $this->artisan('blog:seed-competitor-comparisons', [
            '--only' => 'applyglide',
            '--ai' => true,
            '--publish' => true,
        ])->assertExitCode(0);

        $blog = Blog::query()->where('slug', 'autocvapply-vs-applyglide')->firstOrFail();
        $this->assertStringContainsString('AI-REFRESHED Cloudflare 520', $blog->body);
        $this->assertStringContainsString('[ApplyGlide](https://applyglide.com)', $blog->body);
    }

    public function test_refresh_research_scrapes_before_ai(): void
    {
        $definition = collect(BlogCompetitorComparisons::definitions())
            ->firstWhere('id', 'loopcv');
        $this->assertNotNull($definition);
        $aiBody = BlogCompetitorComparisons::body($definition);

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('scrape')
                ->atLeast()
                ->once()
                ->andReturn([
                    'title' => 'LoopCV',
                    'markdown' => 'LoopCV auto-apply overview',
                    'url' => 'https://www.loopcv.pro',
                ]);
        });

        $this->mock(NanoGptService::class, function (MockInterface $mock) use ($aiBody): void {
            $mock->shouldReceive('chat')->once()->andReturn($aiBody);
        });

        $this->artisan('blog:seed-competitor-comparisons', [
            '--only' => 'loopcv',
            '--refresh-research' => true,
            '--dry-run' => true,
        ])->assertExitCode(0);
    }
}
