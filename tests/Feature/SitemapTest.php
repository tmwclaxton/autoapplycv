<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
use App\Models\Blog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SitemapTest extends TestCase
{
    use RefreshDatabase;

    public function test_sitemap_includes_marketing_pages_and_published_blogs(): void
    {
        $published = Blog::factory()->create([
            'slug' => 'easy-apply-tips',
            'status' => BlogStatus::Published,
            'published_at' => now()->subDay(),
        ]);
        Blog::factory()->create([
            'slug' => 'draft-post',
            'status' => BlogStatus::Draft,
            'published_at' => null,
        ]);

        $response = $this->get('/sitemap.xml');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/xml; charset=UTF-8');

        $xml = $response->getContent();
        $this->assertIsString($xml);
        $this->assertStringContainsString('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', $xml);
        $this->assertStringContainsString('<loc>'.route('home', absolute: true).'</loc>', $xml);
        $this->assertStringContainsString('<loc>'.route('pricing', absolute: true).'</loc>', $xml);
        $this->assertStringContainsString('<loc>'.route('blog.index', absolute: true).'</loc>', $xml);
        $this->assertStringContainsString('<loc>'.route('blog.show', $published, absolute: true).'</loc>', $xml);
        $this->assertStringNotContainsString('draft-post', $xml);
    }

    public function test_robots_txt_allows_crawlers_and_points_at_sitemap(): void
    {
        $sitemapUrl = rtrim((string) config('app.url'), '/').'/sitemap.xml';

        $response = $this->get('/robots.txt');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/plain; charset=UTF-8');

        $body = $response->getContent();
        $this->assertIsString($body);
        $this->assertStringContainsString('User-agent: *', $body);
        $this->assertStringContainsString('Disallow:', $body);
        $this->assertStringContainsString('Sitemap: '.$sitemapUrl, $body);
    }
}
