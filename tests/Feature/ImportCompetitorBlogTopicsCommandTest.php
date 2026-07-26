<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\CompetitorBlogImportService;
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

    public function test_dry_run_lists_pending_topics_from_multiple_sources(): void
    {
        Storage::fake('local');

        Http::fake([
            'https://blog.loopcv.pro/sitemap-posts.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://blog.loopcv.pro/how-to-auto-apply-on-linkedin/</loc></url>
  <url><loc>https://blog.loopcv.pro/tag/job-search/</loc></url>
</urlset>
XML, 200),
            'https://simplify.jobs/blog/sitemap/posts.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://simplify.jobs/blog</loc></url>
  <url><loc>https://simplify.jobs/blog/autofill-job-applications</loc></url>
</urlset>
XML, 200),
            '*' => Http::response('<?xml version="1.0"?><urlset></urlset>', 200),
        ]);

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('isConfigured')->andReturn(false);
        });

        $this->artisan('blog:import-competitor-topics', [
            '--dry-run' => true,
            '--limit' => 10,
            '--refresh-manifest' => true,
            '--source' => 'loopcv',
        ])
            ->expectsOutputToContain('[loopcv] how-to-auto-apply-on-linkedin')
            ->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 0);
        Storage::disk('local')->assertExists('blog-imports/competitor-manifest.json');

        $manifest = json_decode(Storage::disk('local')->get('blog-imports/competitor-manifest.json'), true);
        $this->assertSame(2, $manifest['version'] ?? null);
        $this->assertArrayHasKey('loopcv:how-to-auto-apply-on-linkedin', $manifest['entries']);
        $this->assertSame('loopcv', $manifest['entries']['loopcv:how-to-auto-apply-on-linkedin']['source_id']);
        $this->assertArrayNotHasKey('loopcv:tag-job-search', $manifest['entries']);
    }

    public function test_refresh_manifest_merges_urls_from_all_enabled_sources(): void
    {
        Storage::fake('local');

        config([
            'blog.import.sources' => [
                [
                    'id' => 'loopcv',
                    'name' => 'LoopCV',
                    'enabled' => true,
                    'sitemap_urls' => ['https://blog.loopcv.pro/sitemap-posts.xml'],
                    'index_urls' => [],
                    'host_suffixes' => ['blog.loopcv.pro'],
                    'path_regex' => '#^/[a-z0-9][a-z0-9-]{2,}/?$#i',
                    'exclude_path_regexes' => ['#^/(tag|author)(/|$)#i'],
                    'brand_names' => ['LoopCV'],
                ],
                [
                    'id' => 'simplify',
                    'name' => 'Simplify',
                    'enabled' => true,
                    'sitemap_urls' => ['https://simplify.jobs/blog/sitemap/posts.xml'],
                    'index_urls' => [],
                    'host_suffixes' => ['simplify.jobs'],
                    'path_regex' => '#^/blog/[^/]+/?$#',
                    'exclude_path_regexes' => [],
                    'brand_names' => ['Simplify'],
                ],
            ],
        ]);

        Http::fake([
            'https://blog.loopcv.pro/sitemap-posts.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://blog.loopcv.pro/linkedin-easy-apply-tips/</loc></url>
</urlset>
XML, 200),
            'https://simplify.jobs/blog/sitemap/posts.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://simplify.jobs/blog/cover-letter-tips/</loc></url>
</urlset>
XML, 200),
        ]);

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('isConfigured')->andReturn(false);
        });

        $importer = app(CompetitorBlogImportService::class);
        $result = $importer->refreshManifestFromSources();

        $this->assertSame(2, $result['added']);
        $this->assertArrayHasKey('loopcv:linkedin-easy-apply-tips', $result['manifest']['entries']);
        $this->assertArrayHasKey('simplify:cover-letter-tips', $result['manifest']['entries']);
        $this->assertSame('simplify', $result['manifest']['entries']['simplify:cover-letter-tips']['source_id']);
    }

    public function test_import_creates_draft_with_hero_image_when_not_skipped(): void
    {
        Storage::fake('local');

        config([
            'blog.import.sources' => [
                [
                    'id' => 'loopcv',
                    'name' => 'LoopCV',
                    'enabled' => true,
                    'sitemap_urls' => ['https://blog.loopcv.pro/sitemap-posts.xml'],
                    'index_urls' => [],
                    'host_suffixes' => ['blog.loopcv.pro'],
                    'path_regex' => '#^/[a-z0-9][a-z0-9-]{2,}/?$#i',
                    'exclude_path_regexes' => [],
                    'brand_names' => ['LoopCV', 'loopcv.pro'],
                ],
            ],
        ]);

        Http::fake([
            'https://blog.loopcv.pro/sitemap-posts.xml' => Http::response(<<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://blog.loopcv.pro/how-to-auto-apply-on-linkedin-2026/</loc></url>
</urlset>
XML, 200),
        ]);

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('scrape')->once()->andReturn([
                'title' => 'How to Auto Apply on LinkedIn 2026 - LoopCV',
                'markdown' => "# How to Auto Apply\n\n## Steps\n\n1. Open Easy Apply\n2. Review answers",
                'url' => 'https://blog.loopcv.pro/how-to-auto-apply-on-linkedin-2026/',
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
                    [
                        'title' => 'LoopCV blog',
                        'url' => 'https://blog.loopcv.pro/how-to-auto-apply-on-linkedin-2026/',
                        'description' => 'Should be filtered.',
                    ],
                ],
            ]);
        });

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Soft abstract office scene');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/hero-test.webp');
        });

        $this->artisan('blog:import-competitor-topics', [
            '--limit' => 1,
            '--refresh-manifest' => true,
            '--source' => 'loopcv',
        ])->assertExitCode(0);

        $blog = Blog::query()->first();
        $this->assertNotNull($blog);
        $this->assertSame(BlogStatus::Draft, $blog->status);
        $this->assertNull($blog->published_at);
        $this->assertNotNull($blog->image_url);
        $this->assertStringContainsString('blogs/heroes/hero-test.webp', (string) $blog->image_url);
        $this->assertStringContainsString('TL;DR', $blog->body);
        $this->assertStringNotContainsString('LoopCV', $blog->body);
        $this->assertStringNotContainsString('AutoApplyMax', $blog->body);
        $this->assertGreaterThan(500, strlen($blog->body));
        $this->assertContains('source-loopcv', $blog->tags);
        $this->assertFalse(collect($blog->sources)->contains(
            fn (array $source): bool => str_contains((string) ($source['url'] ?? ''), 'loopcv.pro'),
        ));
    }

    public function test_url_matcher_rejects_non_post_paths_per_source(): void
    {
        $importer = app(CompetitorBlogImportService::class);
        $loopcv = [
            'id' => 'loopcv',
            'host_suffixes' => ['blog.loopcv.pro'],
            'path_regex' => '#^/[a-z0-9][a-z0-9-]{2,}/?$#i',
            'exclude_path_regexes' => ['#^/(tag|author)(/|$)#i'],
        ];
        $simplify = [
            'id' => 'simplify',
            'host_suffixes' => ['simplify.jobs'],
            'path_regex' => '#^/blog/[^/]+/?$#',
            'exclude_path_regexes' => [],
        ];

        $this->assertTrue($importer->isCompetitorBlogPostUrl(
            'https://blog.loopcv.pro/how-many-jobs-should-you-apply-to-every-day-a-2026-guide/',
            $loopcv,
        ));
        $this->assertFalse($importer->isCompetitorBlogPostUrl(
            'https://blog.loopcv.pro/tag/job-search/',
            $loopcv,
        ));
        $this->assertTrue($importer->isCompetitorBlogPostUrl(
            'https://simplify.jobs/blog/autofill-job-applications',
            $simplify,
        ));
        $this->assertFalse($importer->isCompetitorBlogPostUrl(
            'https://simplify.jobs/blog',
            $simplify,
        ));
        $this->assertFalse($importer->isCompetitorBlogPostUrl(
            'https://www.autoapplymax.com/blog/how-to-auto-apply-on-linkedin-2026',
            $loopcv,
        ));
    }
}
