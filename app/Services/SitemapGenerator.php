<?php

namespace App\Services;

use App\Models\Blog;

class SitemapGenerator
{
    public function xml(): string
    {
        return $this->toXml($this->entries());
    }

    public function robotsTxt(): string
    {
        $sitemapUrl = rtrim((string) config('app.url'), '/').'/sitemap.xml';

        return implode("\n", [
            'User-agent: *',
            'Disallow:',
            '',
            'Sitemap: '.$sitemapUrl,
            '',
        ]);
    }

    /**
     * @return array<int, array{loc: string, lastmod: string|null, changefreq: string, priority: string}>
     */
    public function entries(): array
    {
        $entries = [];

        foreach ($this->staticPages() as $page) {
            $entries[] = [
                'loc' => route($page['route'], absolute: true),
                'lastmod' => null,
                'changefreq' => $page['changefreq'],
                'priority' => $page['priority'],
            ];
        }

        $blogs = Blog::query()
            ->published()
            ->orderByDesc('published_at')
            ->get(['slug', 'published_at', 'updated_at']);

        foreach ($blogs as $blog) {
            $lastmod = $blog->updated_at ?? $blog->published_at;

            $entries[] = [
                'loc' => route('blog.show', $blog, absolute: true),
                'lastmod' => $lastmod?->toAtomString(),
                'changefreq' => 'weekly',
                'priority' => '0.7',
            ];
        }

        return $entries;
    }

    /**
     * @return array<int, array{route: string, changefreq: string, priority: string}>
     */
    private function staticPages(): array
    {
        return [
            ['route' => 'home', 'changefreq' => 'weekly', 'priority' => '1.0'],
            ['route' => 'about', 'changefreq' => 'monthly', 'priority' => '0.8'],
            ['route' => 'how-to', 'changefreq' => 'monthly', 'priority' => '0.8'],
            ['route' => 'pricing', 'changefreq' => 'weekly', 'priority' => '0.9'],
            ['route' => 'contact', 'changefreq' => 'monthly', 'priority' => '0.6'],
            ['route' => 'analytics', 'changefreq' => 'daily', 'priority' => '0.5'],
            ['route' => 'terms', 'changefreq' => 'yearly', 'priority' => '0.3'],
            ['route' => 'privacy', 'changefreq' => 'yearly', 'priority' => '0.3'],
            ['route' => 'blog.index', 'changefreq' => 'daily', 'priority' => '0.8'],
        ];
    }

    /**
     * @param  array<int, array{loc: string, lastmod: string|null, changefreq: string, priority: string}>  $entries
     */
    private function toXml(array $entries): string
    {
        $lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ];

        foreach ($entries as $entry) {
            $lines[] = '  <url>';
            $lines[] = '    <loc>'.$this->escape($entry['loc']).'</loc>';

            if (is_string($entry['lastmod']) && $entry['lastmod'] !== '') {
                $lines[] = '    <lastmod>'.$this->escape($entry['lastmod']).'</lastmod>';
            }

            $lines[] = '    <changefreq>'.$this->escape($entry['changefreq']).'</changefreq>';
            $lines[] = '    <priority>'.$this->escape($entry['priority']).'</priority>';
            $lines[] = '  </url>';
        }

        $lines[] = '</urlset>';
        $lines[] = '';

        return implode("\n", $lines);
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
