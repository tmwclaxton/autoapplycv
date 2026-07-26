<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublishBlogDraftsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_publish_flips_oldest_drafts_to_published(): void
    {
        $first = Blog::factory()->create([
            'title' => 'Draft one',
            'slug' => 'draft-one',
            'status' => BlogStatus::Draft,
            'published_at' => null,
        ]);
        $second = Blog::factory()->create([
            'title' => 'Draft two',
            'slug' => 'draft-two',
            'status' => BlogStatus::Draft,
            'published_at' => null,
        ]);
        Blog::factory()->published()->create([
            'title' => 'Already live',
            'slug' => 'already-live',
        ]);

        $this->artisan('blog:publish', ['--limit' => 1])->assertExitCode(0);

        $first->refresh();
        $second->refresh();

        $this->assertSame(BlogStatus::Published, $first->status);
        $this->assertNotNull($first->published_at);
        $this->assertSame(BlogStatus::Draft, $second->status);
        $this->assertNull($second->published_at);
    }

    public function test_publish_dry_run_does_not_change_status(): void
    {
        $blog = Blog::factory()->create([
            'status' => BlogStatus::Draft,
            'published_at' => null,
        ]);

        $this->artisan('blog:publish', ['--dry-run' => true, '--limit' => 5])
            ->assertExitCode(0);

        $blog->refresh();
        $this->assertSame(BlogStatus::Draft, $blog->status);
        $this->assertNull($blog->published_at);
    }
}
