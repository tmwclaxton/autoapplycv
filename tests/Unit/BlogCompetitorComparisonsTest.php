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

    public function test_tracker_competitors_acknowledge_different_bottleneck(): void
    {
        $huntr = BlogCompetitorComparisons::postFor('huntr');
        $teal = BlogCompetitorComparisons::postFor('teal');

        $this->assertStringContainsString('tracker', strtolower($huntr['body']));
        $this->assertStringContainsString('When Huntr might still fit', $huntr['body']);
        $this->assertStringContainsString('When Teal might still fit', $teal['body']);
    }
}
