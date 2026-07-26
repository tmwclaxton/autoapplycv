<?php

namespace Tests\Unit;

use App\Support\BlogHeroSceneVariety;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BlogHeroSceneVarietyTest extends TestCase
{
    #[Test]
    public function test_select_scene_is_deterministic_for_the_same_seed(): void
    {
        $a = BlogHeroSceneVariety::selectScene(
            'Job application burnout recovery',
            'job-application-burnout',
            'Job application burnout: when volume stops working',
            ['burnout', 'strategy'],
        );
        $b = BlogHeroSceneVariety::selectScene(
            'Job application burnout recovery',
            'job-application-burnout',
            'Job application burnout: when volume stops working',
            ['burnout', 'strategy'],
        );

        $this->assertSame($a['id'], $b['id']);
        $this->assertNotSame('', $a['directive']);
    }

    #[Test]
    public function test_related_topics_can_still_differ_by_slug(): void
    {
        $first = BlogHeroSceneVariety::selectScene(
            'ATS resume tips for Workday',
            'ats-resume-tips-workday',
            'ATS resume tips for Workday',
            ['ats', 'workday', 'resume'],
        );
        $second = BlogHeroSceneVariety::selectScene(
            'ATS resume tips for Workday',
            'ats-resume-tips-greenhouse',
            'ATS resume tips for Greenhouse',
            ['ats', 'greenhouse', 'resume'],
        );

        $this->assertContains($first['id'], ['ats-still-life', 'notebook-jd', 'interview-prep', 'desk-apply']);
        $this->assertContains($second['id'], ['ats-still-life', 'notebook-jd', 'interview-prep', 'desk-apply']);
    }

    #[Test]
    public function test_linkedin_easy_apply_prefers_commute_phone_pool(): void
    {
        $scene = BlogHeroSceneVariety::selectScene(
            'Phone Easy Apply while on the commute',
            'phone-easy-apply-commute',
            'Phone Easy Apply on the commute',
            ['linkedin', 'easy-apply', 'commute', 'mobile'],
        );

        $this->assertSame('commute-phone', $scene['id']);
    }

    #[Test]
    public function test_scene_offset_rotates_within_preferred_pool(): void
    {
        $base = BlogHeroSceneVariety::selectScene(
            'Tailor your CV to the job description',
            'tailor-cv-jd',
            'Tailor your CV to the job description',
            ['cv', 'resume', 'job description', 'match'],
            0,
        );
        $offset = BlogHeroSceneVariety::selectScene(
            'Tailor your CV to the job description',
            'tailor-cv-jd',
            'Tailor your CV to the job description',
            ['cv', 'resume', 'job description', 'match'],
            1,
        );

        $this->assertNotSame($base['id'], $offset['id']);
    }

    #[Test]
    public function test_laptop_cliche_detection(): void
    {
        $this->assertTrue(BlogHeroSceneVariety::isLaptopClicheScene('desk-apply'));
        $this->assertTrue(BlogHeroSceneVariety::isLaptopClicheScene('multi-monitor'));
        $this->assertFalse(BlogHeroSceneVariety::isLaptopClicheScene('notebook-jd'));
        $this->assertFalse(BlogHeroSceneVariety::isLaptopClicheScene('commute-phone'));
    }
}
