<?php

namespace Tests\Feature;

use App\Models\Blog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NormalizeBlogSourcesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_persists_cleaned_source_descriptions(): void
    {
        $blog = Blog::factory()->create([
            'slug' => 'messy-sources-post',
            'sources' => [
                [
                    'title' => '10 AI Tools to Supercharge Your Job Search',
                    'url' => 'https://example.com/ai-tools',
                    'description' => "# 10 AI Tools\n## **AI Tools**\n![logo](https://cdn.example/x.png)\nhttps://chatgpt.com/?q=Summarize",
                ],
            ],
        ]);

        $clean = Blog::factory()->create([
            'slug' => 'already-clean',
            'sources' => [
                [
                    'title' => 'Official site',
                    'url' => 'https://autocvapply.com',
                    'description' => 'Product homepage.',
                ],
            ],
        ]);

        $this->artisan('blog:normalize-sources')
            ->expectsOutputToContain('Updated 1 post(s)')
            ->assertSuccessful();

        $blog->refresh();
        $clean->refresh();

        $description = $blog->sources[0]['description'];
        $this->assertStringNotContainsString('##', $description);
        $this->assertStringNotContainsString('![', $description);
        $this->assertStringNotContainsString('https://', $description);
        $this->assertSame('Product homepage.', $clean->sources[0]['description']);
    }

    public function test_dry_run_does_not_write(): void
    {
        $blog = Blog::factory()->create([
            'slug' => 'dry-run-sources',
            'sources' => [
                [
                    'title' => 'Guide',
                    'url' => 'https://example.com/guide',
                    'description' => '## Messy **markdown** body',
                ],
            ],
        ]);

        $this->artisan('blog:normalize-sources', ['--dry-run' => true])
            ->expectsOutputToContain('Would update 1 post(s)')
            ->assertSuccessful();

        $blog->refresh();
        $this->assertSame('## Messy **markdown** body', $blog->sources[0]['description']);
    }

    public function test_slug_option_limits_scope(): void
    {
        $target = Blog::factory()->create([
            'slug' => 'target-sources',
            'sources' => [
                [
                    'title' => 'Target',
                    'url' => 'https://example.com/target',
                    'description' => '## Target dump',
                ],
            ],
        ]);
        $other = Blog::factory()->create([
            'slug' => 'other-sources',
            'sources' => [
                [
                    'title' => 'Other',
                    'url' => 'https://example.com/other',
                    'description' => '## Other dump',
                ],
            ],
        ]);

        $this->artisan('blog:normalize-sources', ['--slug' => 'target-sources'])
            ->assertSuccessful();

        $target->refresh();
        $other->refresh();

        $this->assertStringNotContainsString('##', $target->sources[0]['description']);
        $this->assertSame('## Other dump', $other->sources[0]['description']);
    }
}
