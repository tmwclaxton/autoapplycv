<?php

namespace Tests\Feature;

use App\Models\Blog;
use App\Support\BlogTitleDiversify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RetitleBlogPostsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_retitle_updates_matching_formulaic_slug(): void
    {
        $oldSlug = 'beginners-guide-to-autofill-job-applications-with-autocvapply-for-faster-uk-job-hunting';
        $expected = BlogTitleDiversify::byOldSlug()[$oldSlug];

        $blog = Blog::factory()->create([
            'title' => 'Beginner\'s Guide to Autofill Job Applications with AutoCVApply for Faster UK Job Hunting',
            'slug' => $oldSlug,
            'excerpt' => 'Discover how to save time and reduce errors.',
        ]);

        $this->artisan('blog:retitle')->assertExitCode(0);

        $blog->refresh();
        $this->assertSame($expected['title'], $blog->title);
        $this->assertSame($expected['excerpt'], $blog->excerpt);
        $this->assertSame($expected['slug'], $blog->slug);
        $this->assertStringNotContainsString('Beginner', $blog->title);
        $this->assertStringNotContainsString('save time', strtolower($blog->title));
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
    }

    public function test_retitle_dry_run_does_not_write(): void
    {
        $oldSlug = 'myth-buster-using-autocvapplys-autofill-is-safe-smart-and-puts-you-in-control';

        $blog = Blog::factory()->create([
            'title' => 'Myth-buster: Using AutoCVApply\'s Autofill Is Safe, Smart, and Puts You in Control',
            'slug' => $oldSlug,
            'excerpt' => 'Old excerpt',
        ]);

        $this->artisan('blog:retitle', ['--dry-run' => true])->assertExitCode(0);

        $blog->refresh();
        $this->assertSame($oldSlug, $blog->slug);
        $this->assertSame('Old excerpt', $blog->excerpt);
    }
}
