<?php

namespace Tests\Feature;

use App\Models\Blog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ReorderBlogTldrCommandTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_reorders_published_post_bodies(): void
    {
        $post = Blog::factory()->published()->create([
            'slug' => 'tldr-at-top',
            'body' => "## TL;DR\n\n1. Upload once\n\n## Deep dive\n\nAdvice.\n\n## FAQ\n\n### Q?\n\nA.\n\n## Get started\n\nCTA.\n",
        ]);

        $this->artisan('blog:reorder-tldr')
            ->assertSuccessful()
            ->expectsOutputToContain('Updated 1 post');

        $body = (string) $post->fresh()->body;
        $this->assertMatchesRegularExpression('/## Deep dive.*## TL;DR.*## FAQ/s', $body);
        $this->assertDoesNotMatchRegularExpression('/\A## TL;DR/s', trim($body));
    }

    #[Test]
    public function dry_run_does_not_write(): void
    {
        $original = "## TL;DR\n\n1. Step\n\n## Body\n\nText.\n\n## FAQ\n\n### Q?\n\nA.\n";
        $post = Blog::factory()->published()->create([
            'slug' => 'dry-run-tldr',
            'body' => $original,
        ]);

        $this->artisan('blog:reorder-tldr', ['--dry-run' => true])
            ->assertSuccessful()
            ->expectsOutputToContain('Dry run');

        $this->assertSame($original, $post->fresh()->body);
    }

    #[Test]
    public function it_skips_posts_already_near_bottom(): void
    {
        Blog::factory()->published()->create([
            'slug' => 'already-good',
            'body' => "## Body\n\nText.\n\n## TL;DR\n\n1. Step\n\n## FAQ\n\n### Q?\n\nA.\n",
        ]);

        $this->artisan('blog:reorder-tldr')
            ->assertSuccessful()
            ->expectsOutputToContain('Updated 0 post');
    }
}
