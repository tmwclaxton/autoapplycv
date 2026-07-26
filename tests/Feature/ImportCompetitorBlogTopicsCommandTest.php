<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\FirecrawlService;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;
use Tests\TestCase;

class ImportCompetitorBlogTopicsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_lists_pending_topics_without_writing(): void
    {
        Storage::fake('local');

        Http::fake([
            'https://www.autoapplymax.com/sitemap.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.autoapplymax.com/blog/how-to-auto-apply-on-linkedin-2026</loc></url>
  <url><loc>https://www.autoapplymax.com/blog/auto-apply-jobs-chrome-extension</loc></url>
  <url><loc>https://www.autoapplymax.com/</loc></url>
</urlset>
XML, 200),
        ]);

        $this->artisan('blog:import-competitor-topics', [
            '--dry-run' => true,
            '--limit' => 5,
            '--refresh-manifest' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 0);
        Storage::disk('local')->assertExists('blog-imports/autoapplymax-manifest.json');
    }

    public function test_import_creates_draft_with_mocked_scrape_and_generation(): void
    {
        Storage::fake('local');

        Http::fake([
            'https://www.autoapplymax.com/sitemap.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.autoapplymax.com/blog/how-to-auto-apply-on-linkedin-2026</loc></url>
</urlset>
XML, 200),
        ]);

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('scrape')->once()->andReturn([
                'title' => 'How to Auto Apply on LinkedIn 2026',
                'markdown' => "# How to Auto Apply\n\n## Steps\n\n1. Open Easy Apply\n2. Review answers",
                'url' => 'https://www.autoapplymax.com/blog/how-to-auto-apply-on-linkedin-2026',
            ]);
            $mock->shouldReceive('search')->andReturn([
                [
                    'title' => 'LinkedIn Easy Apply help',
                    'url' => 'https://www.linkedin.com/help/linkedin',
                    'description' => 'Official help.',
                ],
            ]);
        });

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'topic' => 'How to auto apply on LinkedIn Easy Apply safely in 2026',
                'title' => 'How to Auto Apply on LinkedIn Easy Apply (2026)',
                'pillar_cluster' => 'linkedin-auto-apply',
                'must_cover' => ['User starts Auto Apply', 'Review screening answers'],
                'angle' => 'Practical LinkedIn Auto Apply with AutoCVApply honesty.',
            ]);
        });

        $longBody = "## TL;DR\n\n1. Start from the sidebar\n\n## How LinkedIn Easy Apply works\n\n"
            .str_repeat('Practical LinkedIn auto apply advice for UK job seekers. ', 80)
            ."\n\n## FAQ\n\n### Is Auto Apply silent?\n\nNo - you start each run.\n\n## Get started\n\nTry AutoCVApply.";

        $this->mock(BlogArticleGenerationService::class, function (MockInterface $mock) use ($longBody): void {
            $mock->shouldReceive('generateFullArticle')->once()->andReturn([
                'title' => 'How to Auto Apply on LinkedIn Easy Apply (2026)',
                'excerpt' => 'A practical guide to LinkedIn Easy Apply with review controls.',
                'body' => $longBody,
                'tags' => ['linkedin', 'auto-apply'],
                'sources' => [
                    [
                        'title' => 'LinkedIn Easy Apply help',
                        'url' => 'https://www.linkedin.com/help/linkedin',
                        'description' => 'Official help.',
                    ],
                ],
            ]);
        });

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->never();
            $mock->shouldReceive('generateAndStore')->never();
        });

        $this->artisan('blog:import-competitor-topics', [
            '--limit' => 1,
            '--skip-image' => true,
            '--refresh-manifest' => true,
        ])->assertExitCode(0);

        $blog = Blog::query()->first();
        $this->assertNotNull($blog);
        $this->assertSame(BlogStatus::Draft, $blog->status);
        $this->assertNull($blog->published_at);
        $this->assertStringContainsString('TL;DR', $blog->body);
        $this->assertStringNotContainsString('AutoApplyMax', $blog->body);
        $this->assertGreaterThan(500, strlen($blog->body));
    }
}
