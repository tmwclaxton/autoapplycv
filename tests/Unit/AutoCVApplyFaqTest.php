<?php

namespace Tests\Unit;

use App\Support\AutoCVApplyFaq;
use Tests\TestCase;

class AutoCVApplyFaqTest extends TestCase
{
    public function test_faq_covers_core_product_questions(): void
    {
        $slugs = [];
        foreach (AutoCVApplyFaq::sections() as $section) {
            foreach ($section['items'] as $item) {
                $slugs[] = $item['slug'];
            }
        }

        foreach ([
            'what-is-autocvapply',
            'is-autocvapply-free',
            'which-platforms',
            'how-auto-apply-works',
            'ats-vs-boards',
            'what-uses-credits',
            'silent-bot',
            'will-i-get-banned',
        ] as $slug) {
            $this->assertContains($slug, $slugs);
        }

        $this->assertGreaterThanOrEqual(15, AutoCVApplyFaq::itemCount());
    }

    public function test_faq_answers_stay_honest_and_production_linked(): void
    {
        foreach (AutoCVApplyFaq::sections() as $section) {
            foreach ($section['items'] as $item) {
                $text = implode(' ', $item['paragraphs']);
                $this->assertStringNotContainsString('AutoApplyMax', $text);
                $this->assertStringNotContainsString('unlimited applications', strtolower($text));
                $this->assertStringNotContainsString('localhost', $text);

                foreach ($item['related'] as $related) {
                    if (str_starts_with($related['href'], 'https://autocvapply.com')) {
                        $this->assertStringNotContainsString('localhost', $related['href']);
                    }
                }
            }
        }
    }
}
