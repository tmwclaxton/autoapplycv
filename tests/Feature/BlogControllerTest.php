<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlogControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_blog_index_renders_with_published_posts(): void
    {
        Blog::factory()->published()->count(3)->create();
        Blog::factory()->create(['status' => BlogStatus::Draft]);

        $this->get(route('blog.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Blog/Index')
                ->has('posts.data', 3)
            );
    }

    public function test_blog_index_renders_with_no_posts(): void
    {
        $this->get(route('blog.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Blog/Index')
                ->has('posts.data', 0)
            );
    }

    public function test_blog_show_increments_view_count(): void
    {
        $blog = Blog::factory()->published()->create(['view_count' => 0]);

        $this->get(route('blog.show', $blog))->assertOk();

        $this->assertSame(1, $blog->fresh()->view_count);
    }

    public function test_blog_show_renders_published_post(): void
    {
        $blog = Blog::factory()->published()->create([
            'title' => 'Stop retyping your CV on Workday',
            'slug' => 'stop-retyping-workday',
        ]);

        $this->get(route('blog.show', $blog))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Blog/Show')
                ->where('post.title', 'Stop retyping your CV on Workday')
                ->where('post.slug', 'stop-retyping-workday')
                ->has('share_links.facebook')
            );
    }

    public function test_blog_show_renders_markdown_tables_as_html(): void
    {
        $blog = Blog::factory()->published()->create([
            'title' => 'Compare autofill tools',
            'slug' => 'compare-autofill-tools',
            'body' => <<<'MD'
## How to compare

| Criterion | Why it matters |
|-----------|----------------|
| Profile once | Reuse employment history |
| Human control | Review AI text before submit |
MD,
        ]);

        $this->get(route('blog.show', $blog))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Blog/Show')
                ->where(
                    'post.body_html',
                    fn (string $html): bool => str_contains($html, '<table>')
                        && str_contains($html, '<th>Criterion</th>')
                        && str_contains($html, '<td>Profile once</td>')
                        && str_contains($html, 'postbox-table-wrap')
                )
            );
    }

    public function test_blog_show_returns_404_for_draft_post(): void
    {
        $blog = Blog::factory()->create([
            'status' => BlogStatus::Draft,
            'slug' => 'unpublished-draft',
        ]);

        $this->get(route('blog.show', $blog))->assertNotFound();
    }

    public function test_blog_show_returns_404_for_future_published_post(): void
    {
        $blog = Blog::factory()->create([
            'status' => BlogStatus::Published,
            'published_at' => now()->addHour(),
            'slug' => 'future-post',
        ]);

        $this->get(route('blog.show', $blog))->assertNotFound();
    }
}
