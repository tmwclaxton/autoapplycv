<?php

namespace Tests\Feature;

use App\Services\CompetitorComparisonArticleService;
use App\Services\CompetitorComparisonResearchService;
use App\Support\BlogCompetitorComparisons;
use Tests\TestCase;

class CompetitorComparisonArticleServiceTest extends TestCase
{
    public function test_validation_requires_competitor_homepage_link(): void
    {
        $service = app(CompetitorComparisonArticleService::class);
        $definition = collect(BlogCompetitorComparisons::definitions())->firstWhere('id', 'huntr');
        $this->assertNotNull($definition);

        $body = BlogCompetitorComparisons::body($definition);
        $this->assertTrue($service->bodyPassesValidation($definition, $body));

        $broken = str_replace('https://huntr.co', 'https://example.com', $body);
        $this->assertFalse($service->bodyPassesValidation($definition, $broken));
    }

    public function test_research_urls_include_homepage_pricing_and_extras(): void
    {
        $service = app(CompetitorComparisonResearchService::class);
        $definition = collect(BlogCompetitorComparisons::definitions())->firstWhere('id', 'simplify');
        $this->assertNotNull($definition);

        $urls = $service->urlsForDefinition($definition);
        $this->assertContains('https://simplify.jobs', $urls);
        $this->assertContains('https://simplify.jobs/copilot', $urls);
        $this->assertContains('https://simplify.jobs/install', $urls);
    }

    public function test_default_sources_include_competitor_homepage(): void
    {
        $service = app(CompetitorComparisonArticleService::class);
        $definition = collect(BlogCompetitorComparisons::definitions())->firstWhere('id', 'lazyapply');
        $this->assertNotNull($definition);

        $post = $service->buildPost($definition, useAi: false);
        $urls = array_column($post['sources'], 'url');
        $this->assertContains('https://autocvapply.com', $urls);
        $this->assertContains('https://autocvapply.com/pricing', $urls);
        $this->assertContains('https://lazyapply.com', $urls);
    }

    public function test_validation_rejects_matrix_hedge_copouts(): void
    {
        $service = app(CompetitorComparisonArticleService::class);
        $definition = collect(BlogCompetitorComparisons::definitions())->firstWhere('id', 'massive');
        $this->assertNotNull($definition);

        $body = BlogCompetitorComparisons::body($definition);
        $this->assertTrue($service->bodyPassesValidation($definition, $body));

        $hedged = preg_replace(
            '/\| Chrome\/Firefox apply extension \|[^\n]+\n/',
            "| Chrome/Firefox apply extension | Yes | See their site / features |\n",
            $body,
            1,
        );
        $this->assertIsString($hedged);
        $this->assertFalse($service->bodyPassesValidation($definition, $hedged));
    }
}
