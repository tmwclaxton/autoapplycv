<?php

namespace Tests\Feature;

use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\FirecrawlService;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogArticleFormats;
use App\Support\BlogKeywordStrategy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class GenerateBlogPostCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_autocvapply_context_document_includes_site_url_and_pricing(): void
    {
        $doc = AutoCVApplyBlogContext::document();

        $this->assertStringContainsString('https://autocvapply.com', $doc);
        $this->assertStringContainsString('250', $doc);
        $this->assertStringContainsString('Starter', $doc);
        $this->assertStringContainsString('Workday', $doc);
        $this->assertStringContainsString('Draft All', $doc);
        $this->assertStringContainsString('Auto Apply', $doc);
        $this->assertStringContainsString('LinkedIn Easy Apply', $doc);
        $this->assertStringNotContainsString('http://localhost', $doc);
        $this->assertStringNotContainsString('https://localhost', $doc);
    }

    public function test_dry_run_does_not_create_blog(): void
    {
        $captured = [];

        $this->mock(NanoGptService::class, function (MockInterface $mock) use (&$captured): void {
            $mock->shouldReceive('chat')
                ->once()
                ->andReturnUsing(function (array $messages) use (&$captured): string {
                    $captured = $messages;

                    return 'How to autofill job applications without retyping your CV.';
                });
        });

        $this->artisan('blog:generate', ['--dry-run' => true])
            ->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 0);

        $promptText = collect($captured)->pluck('content')->implode("\n");
        $this->assertStringContainsString('SEO keyword target', $promptText);
        $this->assertTrue(
            collect(BlogKeywordStrategy::clusters())
                ->contains(fn (array $cluster): bool => str_contains($promptText, $cluster['primary'])),
            'Topic generation prompt should include a configured primary keyword.',
        );
        $this->assertStringContainsString('Topics / angles to avoid', $promptText);
    }

    public function test_command_creates_published_blog_when_services_are_mocked(): void
    {
        $researchSources = [
            [
                'title' => 'Workday application tips',
                'url' => 'https://example.com/workday-tips',
                'description' => 'How candidates handle repetitive ATS forms.',
            ],
            [
                'title' => 'Autofill job applications guide',
                'url' => 'https://example.com/autofill-guide',
                'description' => 'Chrome extensions that fill job forms.',
            ],
        ];

        $plan = [
            'title' => 'Stop retyping your CV on every Workday application',
            'excerpt' => 'How AutoCVApply helps UK job seekers autofill repetitive employer forms.',
            'tags' => ['workday', 'productivity'],
            'sources' => [
                [
                    'title' => 'Workday application tips',
                    'url' => 'https://example.com/workday-tips',
                    'description' => 'How candidates handle repetitive ATS forms.',
                ],
            ],
            'sections' => [
                ['heading' => 'Why applications repeat the same questions', 'beats' => 'Employer ATS; fatigue'],
                ['heading' => 'Upload once and autofill from a saved profile', 'beats' => 'Extension; supported sites'],
                ['heading' => 'Choosing a plan for your search volume', 'beats' => 'Free; Starter; Pro'],
            ],
        ];

        $sectionBody = str_repeat('This paragraph explains AutoCVApply benefits for workers with practical detail. ', 45);

        $article = [
            'title' => $plan['title'],
            'excerpt' => $plan['excerpt'],
            'body' => "## Why applications repeat the same questions\n\n{$sectionBody}",
            'tags' => $plan['tags'],
            'sources' => $plan['sources'],
        ];

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')->once()->andReturn('Why job seekers should stop retyping CV details on Workday.');
        });

        $this->mock(FirecrawlService::class, function (MockInterface $mock) use ($researchSources): void {
            $mock->shouldReceive('search')
                ->once()
                ->andReturn($researchSources);
        });

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Job seeker at laptop, flat illustration.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/test.png');
        });

        $this->mock(BlogArticleGenerationService::class, function (MockInterface $mock) use ($article): void {
            $mock->shouldReceive('generateFullArticle')
                ->once()
                ->withArgs(function (
                    string $topic,
                    string $research,
                    string $lengthKey,
                    array $format,
                    mixed $onProgress,
                    ?array $seoTarget,
                ): bool {
                    $this->assertSame('short', $lengthKey);
                    $this->assertIsArray($seoTarget);
                    $this->assertArrayHasKey('primary', $seoTarget);
                    $this->assertStringContainsString('SEO keyword target', $research);
                    $this->assertStringContainsString($seoTarget['primary'], $research);
                    $this->assertStringContainsString('Web research (Firecrawl search results)', $research);
                    $this->assertStringContainsString('https://example.com/workday-tips', $research);

                    return true;
                })
                ->andReturn($article);
        });

        $this->artisan('blog:generate', ['--length' => 'short'])
            ->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 1);
        $blog = Blog::query()->first();
        $this->assertNotNull($blog);
        $this->assertSame('Stop retyping your CV on every Workday application', $blog->title);
        $this->assertContains('autocvapply', $blog->tags);
        $this->assertSame('blogs/heroes/test.png', $blog->getRawOriginal('image_url'));
        $this->assertNotNull($blog->published_at);
        $this->assertSame([
            [
                'title' => 'Workday application tips',
                'url' => 'https://example.com/workday-tips',
                'description' => 'How candidates handle repetitive ATS forms.',
            ],
        ], $blog->sources);
    }

    public function test_command_continues_when_firecrawl_search_fails(): void
    {
        $article = [
            'title' => 'Autofill job applications without retyping your CV',
            'excerpt' => 'Practical AutoCVApply advice for UK job seekers.',
            'body' => "## Why forms repeat\n\n".str_repeat('Practical autofill advice for UK job seekers. ', 40),
            'tags' => ['autofill'],
            'sources' => [
                [
                    'title' => 'Invented source',
                    'url' => 'https://fake.example/source',
                    'description' => 'Should be dropped when research is empty.',
                ],
            ],
        ];

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')->once()->andReturn('How to autofill job applications faster.');
        });

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->atLeast()->once()->andReturn([]);
        });

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Job seeker illustration.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn(null);
        });

        $this->mock(BlogArticleGenerationService::class, function (MockInterface $mock) use ($article): void {
            $mock->shouldReceive('generateFullArticle')
                ->once()
                ->withArgs(function (string $topic, string $research): bool {
                    $this->assertStringNotContainsString('Web research (Firecrawl search results)', $research);

                    return true;
                })
                ->andReturn($article);
        });

        $this->artisan('blog:generate', ['--length' => 'short'])
            ->assertExitCode(0);

        $blog = Blog::query()->first();
        $this->assertNotNull($blog);
        $this->assertSame([], $blog->sources);
    }

    public function test_topic_angles_list_is_non_empty(): void
    {
        $this->assertNotEmpty(BlogArticleFormats::topicAngles());
    }

    public function test_seo_keyword_strategy_is_configured_for_blog_generate(): void
    {
        $this->assertNotEmpty(config('blog.seo.clusters'));
        $this->assertNotEmpty(config('blog.seo.primary_keywords'));
        $this->assertContains('AutoCVApply', config('blog.seo.brand_terms'));
        $this->assertNotEmpty(config('blog.seo.banned_title_phrases'));
        $this->assertNotEmpty(config('blog.seo.title_styles'));
        $this->assertSame('https://autocvapply.com', config('blog.public_site_url'));

        foreach (config('blog.seo.clusters') as $cluster) {
            $this->assertNotEmpty($cluster['must_cover'] ?? [], $cluster['id'].' needs must_cover beats');
        }
    }

    public function test_dry_run_accepts_forced_cluster(): void
    {
        $captured = [];

        $this->mock(NanoGptService::class, function (MockInterface $mock) use (&$captured): void {
            $mock->shouldReceive('chat')
                ->once()
                ->andReturnUsing(function (array $messages) use (&$captured): string {
                    $captured = $messages;

                    return 'How to run LinkedIn Easy Apply chrome extension Auto Apply from the AutoCVApply sidebar.';
                });
        });

        $this->artisan('blog:generate', [
            '--dry-run' => true,
            '--cluster' => 'linkedin-easy-apply',
        ])->assertExitCode(0);

        $promptText = collect($captured)->pluck('content')->implode("\n");
        $this->assertStringContainsString('linkedin-easy-apply', $promptText);
        $this->assertStringContainsString('LinkedIn Easy Apply chrome extension', $promptText);
        $this->assertStringContainsString('Must-cover product beats', $promptText);
    }

    public function test_update_regenerates_existing_blog_in_place(): void
    {
        $publishedAt = now()->subDays(3)->startOfSecond();

        $existing = Blog::factory()->create([
            'title' => 'Old generic title',
            'slug' => 'old-generic-title',
            'excerpt' => 'Old excerpt',
            'body' => '## Old\n\nBody',
            'tags' => ['old'],
            'sources' => [],
            'image_url' => 'blogs/heroes/old.png',
            'published_at' => $publishedAt,
        ]);

        $article = [
            'title' => 'Draft All job applications with AutoCVApply profile grounding',
            'excerpt' => 'Use Draft All to answer screening questions from your saved CV profile.',
            'body' => "## What Draft All does\n\n".str_repeat('Draft All helps UK job seekers answer screening questions. ', 40),
            'tags' => ['draft-all'],
            'sources' => [],
        ];

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')->once()->andReturn(
                'How Draft All job applications uses your AutoCVApply profile for screening answers.'
            );
        });

        $this->mock(FirecrawlService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->atLeast()->once()->andReturn([]);
        });

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->never();
            $mock->shouldReceive('generateAndStore')->never();
        });

        $this->mock(BlogArticleGenerationService::class, function (MockInterface $mock) use ($article): void {
            $mock->shouldReceive('generateFullArticle')->once()->andReturn($article);
        });

        $this->artisan('blog:generate', [
            '--length' => 'short',
            '--cluster' => 'draft-all-screening',
            '--update' => (string) $existing->id,
            '--keep-slug' => true,
            '--keep-image' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 1);
        $existing->refresh();
        $this->assertSame('old-generic-title', $existing->slug);
        $this->assertSame('blogs/heroes/old.png', $existing->getRawOriginal('image_url'));
        $this->assertSame('Draft All job applications with AutoCVApply profile grounding', $existing->title);
        $this->assertContains('draft-all-screening', $existing->tags);
        $this->assertTrue($existing->published_at->equalTo($publishedAt));
    }
}
