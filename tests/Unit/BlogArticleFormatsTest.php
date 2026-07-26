<?php

namespace Tests\Unit;

use App\Services\BlogArticleGenerationService;
use App\Support\BlogArticleFormats;
use Tests\TestCase;

class BlogArticleFormatsTest extends TestCase
{
    public function test_pillar_length_preset_has_expected_guidance_and_sections(): void
    {
        $this->assertContains('pillar', BlogArticleFormats::lengthPresetKeys());
        $this->assertSame(7, BlogArticleFormats::sectionCountForLength('pillar'));
        $this->assertStringContainsString('2000-2800', BlogArticleFormats::articleBodyWordGuidance('pillar'));
    }

    public function test_default_length_resolves_from_config(): void
    {
        config(['blog.seo.default_generate_length' => 'long']);

        $this->assertSame('long', BlogArticleFormats::resolveArticleLength('default'));
        $this->assertSame('pillar', BlogArticleFormats::resolveArticleLength('pillar'));
    }

    public function test_normalize_article_plan_includes_tldr_faq_and_cta(): void
    {
        $plan = BlogArticleGenerationService::normalizeArticlePlan([
            'title' => 'How to autofill job applications (2026)',
            'excerpt' => 'Practical autofill tips.',
            'tags' => ['autofill'],
            'sources' => [],
            'tldr' => ['Upload your CV', 'Edit the profile', 'Autofill and review'],
            'faq' => [
                ['question' => 'Does autofill submit for me?', 'answer' => 'Not on ATS sites - you click Submit.'],
            ],
            'cta' => 'Try AutoCVApply soft CTA.',
            'sections' => [
                ['heading' => 'Why forms repeat', 'beats' => 'Same fields everywhere'],
            ],
        ], 'Fallback', 3);

        $this->assertCount(3, $plan['tldr']);
        $this->assertCount(1, $plan['faq']);
        $this->assertSame('Try AutoCVApply soft CTA.', $plan['cta']);
        $this->assertCount(3, $plan['sections']);
    }
}
