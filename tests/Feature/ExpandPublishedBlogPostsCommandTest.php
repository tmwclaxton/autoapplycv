<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\FirecrawlService;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class ExpandPublishedBlogPostsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_lists_catalog_targets(): void
    {
        Blog::factory()->published()->create([
            'title' => 'Easy Apply at speed: Auto Apply from the sidebar',
            'slug' => 'easy-apply-at-speed-auto-apply-from-the-sidebar',
            'body' => '## Short',
        ]);

        $this->artisan('blog:expand-published', ['--dry-run' => true])
            ->assertExitCode(0);
    }

    public function test_expand_lengthens_published_body_and_keeps_slug_by_default(): void
    {
        $blog = Blog::factory()->published()->create([
            'title' => 'Easy Apply at speed: Auto Apply from the sidebar',
            'slug' => 'easy-apply-at-speed-auto-apply-from-the-sidebar',
            'excerpt' => 'Short excerpt',
            'body' => "## Short\n\nTiny body.",
            'tags' => ['linkedin-easy-apply'],
        ]);

        $longBody = "## TL;DR\n\n1. Open LinkedIn\n2. Start Auto Apply\n3. Review answers\n\n"
            ."## How to Auto Apply on LinkedIn\n\n"
            .str_repeat('Detailed LinkedIn Easy Apply guidance for UK seekers. ', 100)
            ."\n\n## FAQ\n\n### Do I still submit?\n\nYes on ATS; on boards you start the run.\n\n"
            ."## Get started\n\nUpload once on AutoCVApply.";

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')->never();
        });

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->andReturn([]);
        });

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->never();
            $mock->shouldReceive('generateAndStore')->never();
        });

        $this->mock(BlogArticleGenerationService::class, function (MockInterface $mock) use ($longBody): void {
            $mock->shouldReceive('generateFullArticle')->once()->andReturn([
                'title' => 'How to Auto Apply on LinkedIn Easy Apply (2026)',
                'excerpt' => 'A longer practical guide to LinkedIn Easy Apply.',
                'body' => $longBody,
                'tags' => ['linkedin', 'auto-apply'],
                'sources' => [],
            ]);
        });

        $this->artisan('blog:expand-published', [
            '--slug' => $blog->slug,
            '--skip-image' => true,
            '--limit' => 1,
        ])->assertExitCode(0);

        $blog->refresh();
        $this->assertSame('easy-apply-at-speed-auto-apply-from-the-sidebar', $blog->slug);
        $this->assertSame('How to Auto Apply on LinkedIn Easy Apply (2026)', $blog->title);
        $this->assertSame(BlogStatus::Published, $blog->status);
        $this->assertStringContainsString('TL;DR', $blog->body);
        $this->assertGreaterThan(strlen('## Short\n\nTiny body.'), strlen($blog->body));
    }
}
