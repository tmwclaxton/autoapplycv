<?php

namespace Tests\Feature;

use App\Models\Blog;
use App\Support\BlogCatalogBodies;
use App\Support\BlogTitleDiversify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RetitleBlogPostsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_retitle_rewrites_body_and_pins_what_is_post(): void
    {
        $oldSlug = 'why-upload-a-cv-to-autocvapply-before-you-apply';
        $expected = BlogTitleDiversify::byOldSlug()[$oldSlug];

        $blog = Blog::factory()->create([
            'title' => 'Why upload a CV to AutoCVApply before you apply?',
            'slug' => $oldSlug,
            'excerpt' => 'Old excerpt',
            'body' => '## Old body',
            'published_at' => now()->subDays(3),
        ]);

        $this->artisan('blog:retitle')->assertExitCode(0);

        $blog->refresh();
        $this->assertSame('What is AutoCVApply?', $blog->title);
        $this->assertSame('what-is-autocvapply', $blog->slug);
        $this->assertSame($expected['excerpt'], $blog->excerpt);
        $this->assertStringContainsString('## What AutoCVApply is', $blog->body);
        $this->assertStringContainsString('Draft All', $blog->body);
        $this->assertStringContainsString('Auto Apply', $blog->body);
        $this->assertContains('what-is-autocvapply', $blog->tags);
        $this->assertTrue($blog->published_at->greaterThan(now()->subMinute()));
    }

    public function test_canonical_titles_use_distinct_openings(): void
    {
        $titles = array_column(BlogTitleDiversify::canonicalByTopic(), 'title');
        $openings = array_map(
            fn (string $title): string => implode(' ', array_slice(preg_split('/\s+/', strtolower($title)) ?: [], 0, 3)),
            $titles,
        );

        $this->assertSame(count($openings), count(array_unique($openings)));
        foreach ($titles as $title) {
            $this->assertStringNotContainsString("Beginner's Guide", $title);
            $this->assertDoesNotMatchRegularExpression('/\bsave time\b/i', $title);
        }

        $this->assertStringContainsString('What AutoCVApply is', BlogCatalogBodies::whatIsAutocvapply());
    }

    public function test_retitle_dry_run_does_not_write(): void
    {
        $oldSlug = 'autofill-is-not-a-silent-bot';

        $blog = Blog::factory()->create([
            'title' => 'Autofill is not a silent bot',
            'slug' => $oldSlug,
            'excerpt' => 'Old excerpt',
            'body' => '## Old',
        ]);

        $this->artisan('blog:retitle', ['--dry-run' => true])->assertExitCode(0);

        $blog->refresh();
        $this->assertSame($oldSlug, $blog->slug);
        $this->assertSame('Old excerpt', $blog->excerpt);
        $this->assertSame('## Old', $blog->body);
    }
}
