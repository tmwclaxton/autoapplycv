<?php

namespace Tests\Unit\Support;

use App\Support\AiPhraseDenylist;
use Tests\TestCase;

class AiPhraseDenylistTest extends TestCase
{
    public function test_detects_hard_banned_opener_phrases(): void
    {
        $violations = AiPhraseDenylist::findViolations(
            'I am thrilled to apply for this backend role at your company.',
        );

        $this->assertContains('i am thrilled to apply', $violations['hard']);
        $this->assertSame([], $violations['soft']);
    }

    public function test_detects_delve_phrase(): void
    {
        $violations = AiPhraseDenylist::findViolations(
            'At Riverbank Systems I had to delve into legacy payment APIs.',
        );

        $this->assertContains('delve into', $violations['hard']);
    }

    public function test_clean_human_answer_has_no_violations(): void
    {
        $violations = AiPhraseDenylist::findViolations(
            'At Riverbank Systems as Senior Engineer I rebuilt the billing service in PHP and cut failed payments by 18%.',
        );

        $this->assertSame([], $violations['hard']);
        $this->assertSame([], $violations['soft']);
    }

    public function test_soft_penalty_phrases_are_separate_from_hard(): void
    {
        $violations = AiPhraseDenylist::findViolations(
            'I leverage Kubernetes daily and build robust backend services.',
        );

        $this->assertSame([], $violations['hard']);
        $this->assertContains('leverage', $violations['soft']);
        $this->assertContains('robust', $violations['soft']);
    }

    public function test_mechanical_penalty_caps_human_tone_for_hard_hits(): void
    {
        $penalty = AiPhraseDenylist::mechanicalPenalty([
            'hard' => ['i am excited to apply'],
            'soft' => [],
        ]);

        $this->assertSame(3, $penalty['human_tone_cap']);
        $this->assertSame(0, $penalty['human_tone_penalty']);
        $this->assertFalse($penalty['passed']);
    }

    public function test_mechanical_penalty_is_stricter_for_multiple_hard_hits(): void
    {
        $penalty = AiPhraseDenylist::mechanicalPenalty([
            'hard' => ['i am excited to apply', 'proven track record'],
            'soft' => [],
        ]);

        $this->assertSame(2, $penalty['human_tone_cap']);
        $this->assertFalse($penalty['passed']);
    }

    public function test_mechanical_penalty_applies_soft_score_reduction(): void
    {
        $penalty = AiPhraseDenylist::mechanicalPenalty([
            'hard' => [],
            'soft' => ['leverage', 'utilize'],
        ]);

        $this->assertNull($penalty['human_tone_cap']);
        $this->assertSame(2, $penalty['human_tone_penalty']);
        $this->assertTrue($penalty['passed']);
    }

    public function test_matching_is_case_insensitive(): void
    {
        $violations = AiPhraseDenylist::findViolations(
            'Furthermore, I DELVE INTO microservices at Acme Corp.',
        );

        $this->assertContains('delve into', $violations['hard']);
        $this->assertContains('furthermore', $violations['soft']);
    }
}
