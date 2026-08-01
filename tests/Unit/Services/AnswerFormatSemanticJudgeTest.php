<?php

namespace Tests\Unit\Services;

use App\Services\AnswerFormatSemanticJudge;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerFormatSemanticJudgeTest extends TestCase
{
    #[Test]
    public function passes_threshold_requires_meaning_and_honesty(): void
    {
        $judge = app(AnswerFormatSemanticJudge::class);

        $this->assertTrue($judge->passesThreshold(['meaning' => 3, 'honesty' => 3]));
        $this->assertTrue($judge->passesThreshold(['meaning' => 5, 'honesty' => 4]));
        $this->assertFalse($judge->passesThreshold(['meaning' => 2, 'honesty' => 5]));
        $this->assertFalse($judge->passesThreshold(['meaning' => 5, 'honesty' => 2]));
    }

    #[Test]
    public function combine_passed_requires_format_and_optional_semantic(): void
    {
        $this->assertTrue(AnswerFormatSemanticJudge::combinePassed(true, null));
        $this->assertTrue(AnswerFormatSemanticJudge::combinePassed(true, true));
        $this->assertFalse(AnswerFormatSemanticJudge::combinePassed(false, true));
        $this->assertFalse(AnswerFormatSemanticJudge::combinePassed(true, false));
        $this->assertFalse(AnswerFormatSemanticJudge::combinePassed(false, false));
    }
}
