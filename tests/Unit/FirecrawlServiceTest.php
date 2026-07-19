<?php

namespace Tests\Unit;

use App\Services\FirecrawlService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FirecrawlServiceTest extends TestCase
{
    public function test_search_returns_normalized_sources_from_firecrawl_payload(): void
    {
        config()->set('services.firecrawl.api_key', 'fc-test-key');
        config()->set('services.firecrawl.base_url', 'https://api.firecrawl.dev/v1');
        config()->set('services.firecrawl.timeout', 10);

        Http::fake([
            'https://api.firecrawl.dev/v1/search' => Http::response([
                'success' => true,
                'data' => [
                    [
                        'title' => 'How to autofill job applications',
                        'url' => 'https://example.com/autofill',
                        'description' => 'A practical guide for job seekers.',
                    ],
                    [
                        'title' => 'Duplicate URL',
                        'url' => 'https://example.com/autofill',
                        'description' => 'Should be ignored.',
                    ],
                    [
                        'title' => 'Missing URL',
                        'description' => 'No link.',
                    ],
                ],
            ], 200),
        ]);

        $service = new FirecrawlService;
        $results = $service->search('autofill job applications', 5);

        $this->assertCount(1, $results);
        $this->assertSame('How to autofill job applications', $results[0]['title']);
        $this->assertSame('https://example.com/autofill', $results[0]['url']);
        $this->assertSame('A practical guide for job seekers.', $results[0]['description']);

        Http::assertSent(function ($request): bool {
            return $request->url() === 'https://api.firecrawl.dev/v1/search'
                && $request['query'] === 'autofill job applications'
                && $request['limit'] === 5;
        });
    }

    public function test_search_returns_empty_array_on_http_failure(): void
    {
        config()->set('services.firecrawl.api_key', 'fc-test-key');
        config()->set('services.firecrawl.base_url', 'https://api.firecrawl.dev/v1');

        Http::fake([
            'https://api.firecrawl.dev/v1/search' => Http::response(['error' => 'rate limit'], 429),
        ]);

        $service = new FirecrawlService;
        $this->assertSame([], $service->search('autofill job applications'));
    }

    public function test_search_returns_empty_array_when_api_key_missing(): void
    {
        config()->set('services.firecrawl.api_key', null);

        Http::fake();

        $service = new FirecrawlService;
        $this->assertSame([], $service->search('autofill job applications'));

        Http::assertNothingSent();
    }

    public function test_select_sources_for_article_keeps_only_research_urls(): void
    {
        $research = [
            [
                'title' => 'Guide A',
                'url' => 'https://example.com/a',
                'description' => 'A',
            ],
            [
                'title' => 'Guide B',
                'url' => 'https://example.com/b',
                'description' => 'B',
            ],
        ];

        $selected = FirecrawlService::selectSourcesForArticle($research, [
            ['title' => 'Invented', 'url' => 'https://fake.example/x', 'description' => 'nope'],
            ['title' => 'Pick B', 'url' => 'https://example.com/b', 'description' => 'ignored'],
        ]);

        $this->assertCount(1, $selected);
        $this->assertSame('https://example.com/b', $selected[0]['url']);
        $this->assertSame('Guide B', $selected[0]['title']);
    }

    public function test_select_sources_falls_back_to_all_research_when_plan_has_none(): void
    {
        $research = [
            [
                'title' => 'Guide A',
                'url' => 'https://example.com/a',
                'description' => 'A',
            ],
        ];

        $selected = FirecrawlService::selectSourcesForArticle($research, []);

        $this->assertSame($research, $selected);
    }

    public function test_format_sources_for_prompt_includes_titles_and_urls(): void
    {
        $prompt = FirecrawlService::formatSourcesForPrompt([
            [
                'title' => 'Example Guide',
                'url' => 'https://example.com/guide',
                'description' => 'Useful snippet.',
            ],
        ]);

        $this->assertStringContainsString('Web research (Firecrawl search results)', $prompt);
        $this->assertStringContainsString('Example Guide', $prompt);
        $this->assertStringContainsString('https://example.com/guide', $prompt);
        $this->assertStringContainsString('Useful snippet.', $prompt);
    }
}
