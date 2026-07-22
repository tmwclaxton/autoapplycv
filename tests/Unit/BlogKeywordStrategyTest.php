<?php

namespace Tests\Unit;

use App\Support\BlogKeywordStrategy;
use Tests\TestCase;

class BlogKeywordStrategyTest extends TestCase
{
    public function test_clusters_are_configured_with_primary_and_supporting_keywords(): void
    {
        $clusters = BlogKeywordStrategy::clusters();

        $this->assertNotEmpty($clusters);
        $this->assertNotEmpty(BlogKeywordStrategy::brandTerms());
        $this->assertNotEmpty(BlogKeywordStrategy::topicsToAvoid());
        $this->assertNotEmpty(BlogKeywordStrategy::thinContentRules());

        foreach ($clusters as $cluster) {
            $this->assertIsString($cluster['id']);
            $this->assertNotSame('', $cluster['primary']);
            $this->assertIsArray($cluster['supporting']);
            $this->assertNotEmpty($cluster['supporting']);
        }
    }

    public function test_select_target_avoids_clusters_matching_recent_titles_or_tags(): void
    {
        $clusters = BlogKeywordStrategy::clusters();
        $this->assertGreaterThanOrEqual(2, count($clusters));

        $blocked = $clusters[0];
        $recentTitles = ['Guide to '.$blocked['primary'].' for UK graduates'];
        $recentTags = [str_replace(' ', '-', strtolower($blocked['id']))];

        $seenFreshIds = [];
        for ($i = 0; $i < 40; $i++) {
            $target = BlogKeywordStrategy::selectTarget($recentTitles, $recentTags);
            $seenFreshIds[$target['id']] = true;
            $this->assertNotSame($blocked['id'], $target['id']);
            $this->assertArrayHasKey('selected_supporting', $target);
            $this->assertLessThanOrEqual(4, count($target['selected_supporting']));
        }

        $this->assertNotEmpty($seenFreshIds);
    }

    public function test_prompt_block_includes_primary_supporting_and_avoid_rules(): void
    {
        $target = [
            'id' => 'autofill-job-applications',
            'weight' => 3,
            'primary' => 'autofill job applications',
            'supporting' => [
                'autofill job application forms',
                'chrome extension autofill CV',
                'upload once apply everywhere',
            ],
            'angle_hints' => ['Time saved on repetitive forms'],
            'must_cover' => [
                'Upload CV once and edit the parsed profile before filling forms',
            ],
            'selected_supporting' => [
                'autofill job application forms',
                'chrome extension autofill CV',
            ],
        ];

        $block = BlogKeywordStrategy::promptBlock($target);

        $this->assertStringContainsString('Primary keyword', $block);
        $this->assertStringContainsString('autofill job applications', $block);
        $this->assertStringContainsString('autofill job application forms', $block);
        $this->assertStringContainsString('chrome extension autofill CV', $block);
        $this->assertStringContainsString('AutoCVApply', $block);
        $this->assertStringContainsString('Topics / angles to avoid', $block);
        $this->assertStringContainsString('Thin-content rules', $block);
        $this->assertStringContainsString('Must-cover product beats', $block);
        $this->assertStringContainsString('Banned generic title/topic phrases', $block);
        $this->assertStringContainsString('product-led SEO post', $block);
        $this->assertStringContainsString('no stuffing', strtolower($block));
    }

    public function test_target_for_cluster_returns_selected_supporting(): void
    {
        $target = BlogKeywordStrategy::targetForCluster('linkedin-easy-apply');

        $this->assertSame('linkedin-easy-apply', $target['id']);
        $this->assertSame('LinkedIn Easy Apply chrome extension', $target['primary']);
        $this->assertNotEmpty($target['must_cover']);
        $this->assertArrayHasKey('selected_supporting', $target);
    }

    public function test_title_looks_generic_detects_banned_phrases(): void
    {
        $this->assertTrue(BlogKeywordStrategy::titleLooksGeneric(
            'How UK Job Seekers Can Save Time and Cut Errors Using Autofill'
        ));
        $this->assertTrue(BlogKeywordStrategy::titleLooksGeneric(
            'Beginner\'s Guide to Autofill Job Applications with AutoCVApply'
        ));
        $this->assertTrue(BlogKeywordStrategy::titleLooksGeneric(
            'Useful tips from AutoCVApply for AutoCVApply users'
        ));
        $this->assertFalse(BlogKeywordStrategy::titleLooksGeneric(
            'LinkedIn Easy Apply from the Auto Apply sidebar'
        ));
    }

    public function test_title_too_similar_to_recent_detects_shared_openings(): void
    {
        $this->assertTrue(BlogKeywordStrategy::titleTooSimilarToRecent(
            'Beginner\'s Guide to Draft All on Workday',
            ['Beginner\'s Guide to Autofill Job Applications with AutoCVApply'],
        ));
        $this->assertFalse(BlogKeywordStrategy::titleTooSimilarToRecent(
            'Indeed, Totaljobs, Glassdoor, Reed: one Auto Apply sidebar',
            ['LinkedIn Easy Apply from the Auto Apply sidebar'],
        ));
    }

    public function test_select_title_style_prefers_unused_styles(): void
    {
        $styles = BlogKeywordStrategy::titleStyles();
        $this->assertNotEmpty($styles);

        $style = BlogKeywordStrategy::selectTitleStyle([
            'LinkedIn Easy Apply from the Auto Apply sidebar',
            'Can you Auto Apply on Indeed and still review every answer?',
        ]);

        $this->assertArrayHasKey('id', $style);
        $this->assertArrayHasKey('hint', $style);
    }

    public function test_prompt_block_includes_title_style_when_provided(): void
    {
        $block = BlogKeywordStrategy::promptBlock([
            'id' => 'linkedin-easy-apply',
            'weight' => 3,
            'primary' => 'LinkedIn Easy Apply chrome extension',
            'supporting' => [],
            'angle_hints' => [],
            'must_cover' => [],
            'selected_supporting' => [],
            'title_style' => [
                'id' => 'board-or-ats',
                'label' => 'Board or ATS first',
                'hint' => 'Lead with LinkedIn.',
                'example' => 'LinkedIn Easy Apply from the Auto Apply sidebar',
            ],
        ]);

        $this->assertStringContainsString('Required title style for this post', $block);
        $this->assertStringContainsString('Board or ATS first', $block);
        $this->assertStringContainsString('Do NOT start with "Beginner\'s Guide"', $block);
    }

    public function test_tags_for_target_include_brand_and_slugified_keywords(): void
    {
        $tags = BlogKeywordStrategy::tagsForTarget([
            'primary' => 'LinkedIn Easy Apply chrome extension',
            'selected_supporting' => ['auto apply LinkedIn jobs'],
        ]);

        $this->assertContains('autocvapply', $tags);
        $this->assertContains('linkedin-easy-apply-chrome-extension', $tags);
        $this->assertContains('auto-apply-linkedin-jobs', $tags);
    }

    public function test_cluster_matches_recent_when_primary_appears_in_haystack(): void
    {
        $haystack = BlogKeywordStrategy::normaliseHaystack(
            ['How to autofill job applications faster'],
            ['careers'],
        );

        $this->assertTrue(BlogKeywordStrategy::clusterMatchesRecent([
            'id' => 'autofill-job-applications',
            'primary' => 'autofill job applications',
            'supporting' => [],
        ], $haystack));

        $this->assertFalse(BlogKeywordStrategy::clusterMatchesRecent([
            'id' => 'linkedin-easy-apply',
            'primary' => 'LinkedIn Easy Apply chrome extension',
            'supporting' => [],
        ], $haystack));
    }
}
