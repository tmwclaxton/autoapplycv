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

    public function test_blog_show_repairs_collapsed_markdown_into_html_tags(): void
    {
        $blog = Blog::factory()->published()->create([
            'title' => 'Choose an auto apply tool',
            'slug' => 'choose-auto-apply-tool',
            'body' => '## TL;DR 1. Upload your CV once. 2. Review before you submit. ## Understanding Auto Apply vs Autofill Chrome Extensions When navigating job boards, pick tools that keep you in control. ### Autofill Extensions: What They Do Autofill Chrome extensions primarily fill repeated fields.',
        ]);

        $this->get(route('blog.show', $blog))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Blog/Show')
                ->where(
                    'post.body_html',
                    fn (string $html): bool => str_contains($html, '<h2>TL;DR</h2>')
                        && str_contains($html, '<h2>Understanding Auto Apply vs Autofill Chrome Extensions</h2>')
                        && str_contains($html, '<h3>Autofill Extensions: What They Do</h3>')
                        && str_contains($html, '<p>')
                        && ! str_contains($html, '## ')
                )
            );
    }

    public function test_blog_show_renders_inline_images_and_youtube_embeds(): void
    {
        $blog = Blog::factory()->published()->create([
            'title' => 'How Auto Apply looks in practice',
            'slug' => 'auto-apply-in-practice',
            'body' => <<<'MD'
## Walkthrough

![Side panel drafting answers](https://cdn.example.com/side-panel.png)

<figure>
<img src="https://cdn.example.com/score.png" alt="ATS score">
<figcaption>Score before you apply</figcaption>
</figure>

<iframe src="https://www.youtube.com/embed/CwdVyGdgXk8" title="Product walkthrough"></iframe>

<script>alert("xss")</script>
<iframe src="https://evil.example/embed"></iframe>
MD,
        ]);

        $this->get(route('blog.show', $blog))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Blog/Show')
                ->where(
                    'post.body_html',
                    fn (string $html): bool => str_contains($html, 'cdn.example.com/side-panel.png')
                        && str_contains($html, '<figcaption>Score before you apply</figcaption>')
                        && str_contains($html, 'postbox-embed')
                        && str_contains($html, 'youtube-nocookie.com/embed/CwdVyGdgXk8')
                        && ! str_contains($html, '<script')
                        && ! str_contains($html, 'evil.example')
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
