<?php

namespace Tests\Unit;

use App\Support\BlogMarkdownRenderer;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BlogMarkdownRendererTest extends TestCase
{
    #[Test]
    public function it_renders_markdown_images(): void
    {
        $html = BlogMarkdownRenderer::toHtml('![Dashboard screenshot](https://cdn.example.com/shot.png)');

        $this->assertStringContainsString('<img', $html);
        $this->assertStringContainsString('src="https://cdn.example.com/shot.png"', $html);
        $this->assertStringContainsString('alt="Dashboard screenshot"', $html);
        $this->assertStringContainsString('loading="lazy"', $html);
    }

    #[Test]
    public function it_renders_figures_with_captions(): void
    {
        $html = BlogMarkdownRenderer::toHtml(
            '<figure><img src="https://cdn.example.com/a.png" alt="A"><figcaption>Side by side</figcaption></figure>',
        );

        $this->assertStringContainsString('<figure>', $html);
        $this->assertStringContainsString('<figcaption>Side by side</figcaption>', $html);
        $this->assertStringContainsString('src="https://cdn.example.com/a.png"', $html);
    }

    #[Test]
    public function it_wraps_gfm_tables(): void
    {
        $html = BlogMarkdownRenderer::toHtml(<<<'MD'
| Tool | Fit |
|------|-----|
| AutoCVApply | High |
MD);

        $this->assertStringContainsString('postbox-table-wrap', $html);
        $this->assertStringContainsString('<table>', $html);
        $this->assertStringContainsString('<th>Tool</th>', $html);
        $this->assertStringContainsString('<td>AutoCVApply</td>', $html);
    }

    #[Test]
    public function it_embeds_allowlisted_youtube_iframes(): void
    {
        $html = BlogMarkdownRenderer::toHtml(
            '<iframe src="https://www.youtube.com/embed/CwdVyGdgXk8" title="Demo"></iframe>',
        );

        $this->assertStringContainsString('postbox-embed', $html);
        $this->assertStringContainsString('<iframe', $html);
        $this->assertStringContainsString('youtube-nocookie.com/embed/CwdVyGdgXk8', $html);
        $this->assertStringNotContainsString('src="https://www.youtube.com/embed/', $html);
    }

    #[Test]
    public function it_promotes_standalone_youtube_urls_to_embeds(): void
    {
        $html = BlogMarkdownRenderer::toHtml("Intro\n\nhttps://youtu.be/CwdVyGdgXk8\n\nOutro");

        $this->assertStringContainsString('postbox-embed', $html);
        $this->assertStringContainsString('youtube-nocookie.com/embed/CwdVyGdgXk8', $html);
    }

    #[Test]
    public function it_embeds_vimeo_player_iframes(): void
    {
        $html = BlogMarkdownRenderer::toHtml(
            '<iframe src="https://player.vimeo.com/video/123456789" title="Vimeo"></iframe>',
        );

        $this->assertStringContainsString('postbox-embed', $html);
        $this->assertStringContainsString('player.vimeo.com/video/123456789', $html);
    }

    #[Test]
    public function it_strips_non_allowlisted_iframes(): void
    {
        $html = BlogMarkdownRenderer::toHtml(
            '<iframe src="https://evil.example/embed/x"></iframe>',
        );

        $this->assertStringNotContainsString('<iframe', $html);
        $this->assertStringNotContainsString('evil.example', $html);
    }

    #[Test]
    public function it_strips_scripts_and_event_handlers(): void
    {
        $html = BlogMarkdownRenderer::toHtml(
            '<p onclick="alert(1)">Hello</p><script>alert(2)</script><img src="https://cdn.example.com/x.png" onerror="alert(3)" alt="x">',
        );

        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('onerror', $html);
        $this->assertStringContainsString('Hello', $html);
        $this->assertStringContainsString('src="https://cdn.example.com/x.png"', $html);
    }

    #[Test]
    public function it_strips_javascript_links(): void
    {
        $html = BlogMarkdownRenderer::toHtml('[Click](javascript:alert(1))');

        $this->assertStringNotContainsString('javascript:', $html);
        $this->assertStringContainsString('Click', $html);
    }

    #[Test]
    public function it_keeps_blockquotes_lists_and_code(): void
    {
        $html = BlogMarkdownRenderer::toHtml(<<<'MD'
> Stay in control of every submit.

- One profile
- Many boards

`autofill` and:

```
draft all
```
MD);

        $this->assertStringContainsString('<blockquote>', $html);
        $this->assertStringContainsString('<ul>', $html);
        $this->assertStringContainsString('<code>', $html);
        $this->assertStringContainsString('<pre>', $html);
    }
}
