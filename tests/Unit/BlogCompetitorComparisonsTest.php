<?php

namespace Tests\Unit;

use App\Support\BlogCompetitorComparisons;
use Tests\TestCase;

class BlogCompetitorComparisonsTest extends TestCase
{
    public function test_definitions_cover_footer_competitors_and_autoapplymax(): void
    {
        $ids = array_column(BlogCompetitorComparisons::definitions(), 'id');

        foreach ([
            'autoapplymax',
            'lazyapply',
            'simplify',
            'loopcv',
            'applyglide',
            'jobcopilot',
            'huntr',
            'sonara',
            'teal',
            'massive',
        ] as $id) {
            $this->assertContains($id, $ids);
        }

        $this->assertCount(10, $ids);
    }

    public function test_bodies_include_tldr_honesty_and_no_invented_guarantee(): void
    {
        $post = BlogCompetitorComparisons::postFor('autoapplymax');

        $this->assertSame('autocvapply-vs-autoapplymax', $post['slug']);
        $this->assertStringContainsString('AutoCVApply vs AutoApplyMax', $post['title']);
        $this->assertStringContainsString('## TL;DR', $post['body']);
        $this->assertStringContainsString('## FAQ', $post['body']);
        $this->assertStringContainsString('LinkedIn Easy Apply', $post['body']);
        $this->assertStringContainsString('you still click submit', strtolower($post['body']));
        $this->assertStringContainsString('Does AutoCVApply guarantee more interviews?', $post['body']);
        $this->assertStringContainsString('https://autocvapply.com/login', $post['body']);
        $this->assertStringNotContainsString('http://localhost', $post['body']);
    }

    public function test_bodies_include_competitor_and_autocvapply_links_plus_required_sections(): void
    {
        $post = BlogCompetitorComparisons::postFor('applyglide');

        $this->assertStringContainsString('[ApplyGlide](https://applyglide.com)', $post['body']);
        $this->assertStringContainsString('https://autocvapply.com/pricing', $post['body']);
        $this->assertStringContainsString('https://autocvapply.com/how-to', $post['body']);
        $this->assertStringContainsString('https://autocvapply.com/blog/what-is-autocvapply', $post['body']);
        $this->assertStringContainsString('## Who each product is for', $post['body']);
        $this->assertStringContainsString('### Feature matrix', $post['body']);
        $this->assertStringContainsString('### Automation and privacy model', $post['body']);
        $this->assertStringContainsString('## Pricing posture', $post['body']);
        $this->assertStringContainsString('## When ApplyGlide might still fit', $post['body']);
        $this->assertStringContainsString('Cloudflare 520', $post['body']);
        $this->assertStringContainsString('## Get started', $post['body']);

        foreach (BlogCompetitorComparisons::requiredBodyMarkers('ApplyGlide') as $marker) {
            $this->assertStringContainsString($marker, $post['body']);
        }
    }

    public function test_definitions_include_homepage_urls_and_crawl_summaries(): void
    {
        foreach (BlogCompetitorComparisons::definitions() as $definition) {
            $this->assertNotSame('', $definition['homepage_url']);
            $this->assertStringStartsWith('http', $definition['homepage_url']);
            $this->assertNotEmpty($definition['crawl_summary']);
            $this->assertNotSame('', $definition['pricing_posture']);
            $this->assertNotSame('', $definition['automation_model']);
        }
    }

    public function test_tracker_competitors_acknowledge_different_bottleneck(): void
    {
        $huntr = BlogCompetitorComparisons::postFor('huntr');
        $teal = BlogCompetitorComparisons::postFor('teal');

        $this->assertStringContainsString('tracker', strtolower($huntr['body']));
        $this->assertStringContainsString('When Huntr might still fit', $huntr['body']);
        $this->assertStringContainsString('When Teal might still fit', $teal['body']);
        $this->assertStringContainsString('https://huntr.co', $huntr['body']);
        $this->assertStringContainsString('https://www.tealhq.com', $teal['body']);
    }

    public function test_bodies_do_not_contain_em_dashes(): void
    {
        foreach (BlogCompetitorComparisons::allPosts() as $post) {
            $this->assertStringNotContainsString("\u{2014}", $post['body']);
            $this->assertStringNotContainsString("\u{2013}", $post['body']);
        }
    }
}
