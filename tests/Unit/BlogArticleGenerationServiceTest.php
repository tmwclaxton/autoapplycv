<?php

namespace Tests\Unit;

use App\Services\BlogArticleGenerationService;
use App\Services\NanoGptService;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

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

    public function test_generate_full_article_prompts_include_seo_keyword_target(): void
    {
        $planMessages = null;
        $sectionMessages = null;

        /** @var NanoGptService&MockInterface $nanoGpt */
        $nanoGpt = Mockery::mock(NanoGptService::class);
        $nanoGpt->shouldReceive('chatJson')
            ->times(4)
            ->andReturnUsing(function (array $messages) use (&$planMessages, &$sectionMessages): array {
                if ($planMessages === null) {
                    $planMessages = $messages;

                    return [
                        'title' => 'How to autofill job applications with AutoCVApply',
                        'excerpt' => 'Use a Chrome extension to autofill job applications from one profile.',
                        'tags' => ['autofill-job-applications', 'chrome-extension'],
                        'sources' => [],
                        'sections' => [
                            [
                                'heading' => 'Why autofill job applications saves time',
                                'beats' => 'Repetitive forms; profile once',
                            ],
                            [
                                'heading' => 'Set up your profile once',
                                'beats' => 'Upload CV; edit fields',
                            ],
                            [
                                'heading' => 'Use the Chrome extension on real forms',
                                'beats' => 'Autofill; review; submit',
                            ],
                        ],
                    ];
                }

                $sectionMessages ??= $messages;

                return [
                    'content' => str_repeat('Practical autofill advice for UK job seekers using AutoCVApply. ', 40),
                ];
            });

        $service = new BlogArticleGenerationService($nanoGpt);

        $article = $service->generateFullArticle(
            'How to autofill job applications without retyping your CV',
            'Research brief about AutoCVApply autofill.',
            'short',
            [
                'key' => 'step-by-step',
                'name' => 'Step-by-step guide',
                'hint' => 'Walk through steps.',
                'title_pattern' => 'How to...',
            ],
            null,
            [
                'id' => 'autofill-job-applications',
                'weight' => 3,
                'primary' => 'autofill job applications',
                'supporting' => ['chrome extension autofill CV'],
                'angle_hints' => [],
                'selected_supporting' => ['chrome extension autofill CV', 'upload once apply everywhere'],
            ],
        );

        $this->assertSame('How to autofill job applications with AutoCVApply', $article['title']);
        $this->assertNotNull($planMessages);
        $this->assertNotNull($sectionMessages);

        $planPrompt = collect($planMessages)->pluck('content')->implode("\n");
        $sectionPrompt = collect($sectionMessages)->pluck('content')->implode("\n");

        $this->assertStringContainsString('autofill job applications', $planPrompt);
        $this->assertStringContainsString('SEO keyword target', $planPrompt);
        $this->assertStringContainsString('without stuffing', $planPrompt);
        $this->assertStringContainsString('chrome extension autofill CV', $sectionPrompt);
        $this->assertStringContainsString('never keyword-stuff', $sectionPrompt);
    }
}
