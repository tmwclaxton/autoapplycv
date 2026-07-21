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
        $this->assertStringContainsString('no stuffing', strtolower($block));
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
