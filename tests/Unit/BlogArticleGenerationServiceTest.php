<?php

namespace Tests\Unit;

use App\Services\BlogArticleGenerationService;
use PHPUnit\Framework\TestCase;

class BlogArticleGenerationServiceTest extends TestCase
{
    public function test_normalize_article_plan_coerces_array_beats_to_string(): void
    {
        $plan = BlogArticleGenerationService::normalizeArticlePlan([
            'title' => 'Test title',
            'excerpt' => 'Test excerpt',
            'tags' => ['job-search'],
            'sources' => [],
            'sections' => [
                [
                    'heading' => 'Why forms repeat',
                    'beats' => ['Employer ATS', 'Application fatigue'],
                ],
            ],
        ], 'Fallback topic', 3);

        $this->assertSame('Employer ATS Application fatigue', $plan['sections'][0]['beats']);
        $this->assertCount(3, $plan['sections']);
    }
}
