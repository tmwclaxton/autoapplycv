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
        $this->assertMatchesRegularExpression('/## Pricing posture.*## TL;DR.*## FAQ/s', $post['body']);
        $this->assertDoesNotMatchRegularExpression('/\A## TL;DR/s', trim($post['body']));
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

    public function test_feature_matrices_use_decisive_answers_without_hedge_copouts(): void
    {
        foreach (BlogCompetitorComparisons::definitions() as $definition) {
            $matrix = $definition['feature_matrix'];
            $this->assertArrayHasKey('extension', $matrix);
            $this->assertArrayHasKey('uk_boards', $matrix);
            $this->assertArrayHasKey('ats_autofill', $matrix);
            $this->assertArrayHasKey('draft_all', $matrix);
            $this->assertArrayHasKey('job_tracker', $matrix);
            $this->assertArrayHasKey('pricing', $matrix);

            foreach ($matrix as $key => $cell) {
                $this->assertMatchesRegularExpression(
                    '/^(Yes|No|Partial|Unclear)\b/u',
                    $cell,
                    "{$definition['id']}.{$key} must start with Yes/No/Partial/Unclear",
                );
                $this->assertStringContainsString(' - ', $cell, "{$definition['id']}.{$key} needs a short clause after the status");
            }

            $section = BlogCompetitorComparisons::extractFeatureMatrixSection(
                BlogCompetitorComparisons::body($definition),
            );
            $this->assertNotSame('', $section, $definition['id'].' missing feature matrix section');

            foreach (BlogCompetitorComparisons::bannedMatrixHedgePhrases() as $phrase) {
                $this->assertStringNotContainsString(
                    $phrase,
                    $section,
                    "{$definition['id']} matrix contains banned hedge: {$phrase}",
                );
            }
        }
    }

    public function test_massive_matrix_answers_extension_and_uk_boards_decisively(): void
    {
        $post = BlogCompetitorComparisons::postFor('massive');
        $section = BlogCompetitorComparisons::extractFeatureMatrixSection($post['body']);

        $this->assertStringContainsString('No - web autopilot service', $section);
        $this->assertStringContainsString('No - curated company matches', $section);
        $this->assertStringContainsString('Partial - fills and submits applications for you', $section);
        $this->assertStringContainsString('Partial - paid membership via signup', $section);
        $this->assertStringNotContainsString('verify on usemassive', strtolower($section));
        $this->assertStringNotContainsString('See their site', $section);
        $this->assertStringNotContainsString('Varies - see crawl', $section);
    }

    public function test_compare_page_entries_reuse_definitions_with_punchy_reasons(): void
    {
        $entries = BlogCompetitorComparisons::comparePageEntries();

        $this->assertCount(10, $entries);

        foreach ($entries as $entry) {
            $this->assertArrayHasKey('id', $entry);
            $this->assertArrayHasKey('slug', $entry);
            $this->assertArrayHasKey('summary', $entry);
            $this->assertArrayHasKey('homepage_url', $entry);
            $this->assertStringStartsWith('autocvapply-vs-', $entry['slug']);
            $this->assertNotSame('', $entry['summary']);
            $this->assertGreaterThanOrEqual(2, count($entry['reasons']));
            $this->assertLessThanOrEqual(4, count($entry['reasons']));
            $this->assertStringStartsWith('http', $entry['homepage_url']);
        }

        $massive = collect($entries)->firstWhere('id', 'massive');
        $this->assertIsArray($massive);
        $this->assertSame('autocvapply-vs-massive', $massive['slug']);
        $this->assertStringContainsString('LinkedIn, Indeed, Totaljobs', implode(' ', $massive['reasons']));
    }
}
