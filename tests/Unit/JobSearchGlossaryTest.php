<?php

namespace Tests\Unit;

use App\Support\JobSearchGlossary;
use Tests\TestCase;

class JobSearchGlossaryTest extends TestCase
{
    public function test_glossary_has_core_job_search_and_product_terms(): void
    {
        $slugs = array_column(JobSearchGlossary::terms(), 'slug');

        foreach ([
            'ats',
            'auto-apply',
            'autofill',
            'draft-all',
            'easy-apply',
            'credits',
            'cv',
            'screening-questions',
            'workday',
            'indeed-apply',
        ] as $slug) {
            $this->assertContains($slug, $slugs);
        }

        $this->assertGreaterThanOrEqual(30, count($slugs));
    }

    public function test_grouped_letters_only_include_active_entries(): void
    {
        $groups = JobSearchGlossary::groupedByLetter();
        $active = JobSearchGlossary::activeLetters();

        $this->assertSame($active, array_keys($groups));
        $this->assertArrayHasKey('A', $groups);
        $this->assertArrayNotHasKey('X', $groups);

        foreach ($groups as $letter => $terms) {
            $this->assertNotEmpty($terms);
            foreach ($terms as $term) {
                $this->assertSame($letter, $term['letter']);
                $this->assertNotEmpty($term['paragraphs']);
                $this->assertStringNotContainsString('AutoApplyMax', implode(' ', $term['paragraphs']));
            }
        }
    }

    public function test_related_links_use_production_host(): void
    {
        foreach (JobSearchGlossary::terms() as $term) {
            foreach ($term['related'] as $related) {
                $this->assertStringStartsWith('https://autocvapply.com', $related['href']);
                $this->assertStringNotContainsString('localhost', $related['href']);
            }
        }
    }
}
