<?php

namespace Tests\Unit\Support;

use App\Support\YearsExperienceAnswerNormalizer;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class YearsExperienceAnswerNormalizerTest extends TestCase
{
    #[Test]
    public function it_detects_linkedin_years_questions(): void
    {
        $this->assertTrue(YearsExperienceAnswerNormalizer::isYearsExperienceQuestion(
            'How many years of work experience do you have with Microsoft Azure?',
        ));
        $this->assertFalse(YearsExperienceAnswerNormalizer::isYearsExperienceQuestion(
            'Why are you interested in this role?',
        ));
    }

    #[Test]
    public function it_normalizes_years_answers_to_integers(): void
    {
        $this->assertSame('5', YearsExperienceAnswerNormalizer::normalize('5 years'));
        $this->assertSame('1', YearsExperienceAnswerNormalizer::normalize('1 year of azure'));
        $this->assertSame('8', YearsExperienceAnswerNormalizer::normalize('I have about 8 years of Azure experience'));
        $this->assertSame('99', YearsExperienceAnswerNormalizer::normalize('120 years'));
        $this->assertSame('6', YearsExperienceAnswerNormalizer::normalize('', '6'));
    }
}
