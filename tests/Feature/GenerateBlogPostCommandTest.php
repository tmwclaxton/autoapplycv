<?php

namespace Tests\Feature;

use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use App\Services\NanoGptService;
use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogArticleFormats;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class GenerateBlogPostCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_autocvapply_context_document_includes_site_url_and_pricing(): void
    {
        $doc = AutoCVApplyBlogContext::document();

        $this->assertStringContainsString('autocvapply.com', $doc);
        $this->assertStringContainsString('250', $doc);
        $this->assertStringContainsString('Starter', $doc);
        $this->assertStringContainsString('Workday', $doc);
    }

    public function test_dry_run_does_not_create_blog(): void
    {
        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')->once()->andReturn('How to save time on repetitive job applications.');
        });

        $this->artisan('blog:generate', ['--dry-run' => true])
            ->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 0);
    }

    public function test_command_creates_published_blog_when_services_are_mocked(): void
    {
        $plan = [
            'title' => 'Stop retyping your CV on every Workday application',
            'excerpt' => 'How AutoCVApply helps UK job seekers autofill repetitive employer forms.',
            'tags' => ['workday', 'productivity'],
            'sources' => [
                [
                    'title' => 'AutoCVApply',
                    'url' => 'https://autocvapply.com',
                    'description' => 'Official site.',
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

        $this->mock(BlogArticleGenerationService::class, function (MockInterface $mock) use ($article): void {
            $mock->shouldReceive('generateFullArticle')->once()->andReturn($article);
        });

        $this->artisan('blog:generate', ['--length' => 'short'])
            ->assertExitCode(0);

        $this->assertDatabaseCount('blogs', 1);
        $blog = Blog::query()->first();
        $this->assertNotNull($blog);
        $this->assertSame('Stop retyping your CV on every Workday application', $blog->title);
        $this->assertContains('autocvapply', $blog->tags);
        $this->assertNotNull($blog->published_at);
    }

    public function test_topic_angles_list_is_non_empty(): void
    {
        $this->assertNotEmpty(BlogArticleFormats::topicAngles());
    }
}
