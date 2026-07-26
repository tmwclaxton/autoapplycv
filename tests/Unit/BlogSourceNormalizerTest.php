<?php

namespace Tests\Unit;

use App\Support\BlogSourceNormalizer;
use Tests\TestCase;

class BlogSourceNormalizerTest extends TestCase
{
    public function test_clean_description_strips_markdown_images_headings_and_urls(): void
    {
        $raw = <<<'MD'
# 10 AI Tools to Supercharge Your Job Search
## **AI Tools for Job Searching**
### **3.** [**Teal**](https://www.tealhq.com/)
_Key Features:_
![applygenie for ai job application automation](https://static.wixstatic.com/media/abc123~mv2.png/v1/fill/w_740,h_416,al_c,q_90,usm_0.66_1.00_0.01,enc_avif,quality_auto/applygenie.png)
Ask ChatGPT: https://chatgpt.com/?q=Summarize+this+article+in+5+bullet+points
MD;

        $clean = BlogSourceNormalizer::cleanDescription($raw, 160);

        $this->assertStringNotContainsString('##', $clean);
        $this->assertStringNotContainsString('**', $clean);
        $this->assertStringNotContainsString('![', $clean);
        $this->assertStringNotContainsString('https://', $clean);
        $this->assertStringNotContainsString('chatgpt.com', $clean);
        $this->assertStringNotContainsString('wixstatic', $clean);
        $this->assertStringContainsString('AI Tools', $clean);
        $this->assertLessThanOrEqual(160, mb_strlen($clean));
    }

    public function test_normalize_list_keeps_titled_links_with_short_blurbs(): void
    {
        $sources = BlogSourceNormalizer::normalizeList([
            [
                'title' => '## **Best AI Tools**',
                'url' => 'https://example.com/guide',
                'description' => "# Best AI Tools\n\nA practical roundup for job seekers who want faster applications.",
            ],
            [
                'title' => 'Missing URL',
                'url' => '',
                'description' => 'Should drop',
            ],
            [
                'title' => 'Duplicate',
                'url' => 'https://example.com/guide',
                'description' => 'ignored',
            ],
        ]);

        $this->assertCount(1, $sources);
        $this->assertSame('Best AI Tools', $sources[0]['title']);
        $this->assertSame('https://example.com/guide', $sources[0]['url']);
        $this->assertStringContainsString('practical roundup', $sources[0]['description']);
        $this->assertStringNotContainsString('#', $sources[0]['description']);
    }

    public function test_description_from_search_row_prefers_snippet_over_markdown(): void
    {
        $fromSnippet = BlogSourceNormalizer::descriptionFromSearchRow([
            'snippet' => 'Short meta description for seekers.',
            'markdown' => "# Huge page\n\n![img](https://cdn.example/x.png)\n\nBody dump",
        ]);

        $this->assertSame('Short meta description for seekers.', $fromSnippet);

        $fromMarkdown = BlogSourceNormalizer::descriptionFromSearchRow([
            'markdown' => "## Guide\n\nUseful advice about autofill without dumping the whole page.",
        ]);

        $this->assertStringContainsString('Useful advice', $fromMarkdown);
        $this->assertStringNotContainsString('##', $fromMarkdown);
    }

    public function test_lists_differ_detects_description_cleanup(): void
    {
        $before = [
            [
                'title' => 'Guide',
                'url' => 'https://example.com/a',
                'description' => '## Raw **markdown**',
            ],
        ];
        $after = BlogSourceNormalizer::normalizeList($before);

        $this->assertTrue(BlogSourceNormalizer::listsDiffer($before, $after));
        $this->assertFalse(BlogSourceNormalizer::listsDiffer($after, $after));
    }
}
