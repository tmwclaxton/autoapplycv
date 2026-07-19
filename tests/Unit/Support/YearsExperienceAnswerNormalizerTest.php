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

    #[Test]
    public function it_does_not_fall_back_to_profile_years_for_skill_specific_questions(): void
    {
        $label = 'How many years of work experience do you have with C++?';

        $this->assertTrue(YearsExperienceAnswerNormalizer::isSkillSpecificYearsExperienceQuestion($label));
        $this->assertSame('', YearsExperienceAnswerNormalizer::normalize('', '2', $label));
        $this->assertSame('4', YearsExperienceAnswerNormalizer::normalize('4 years', '2', $label));
    }

    #[Test]
    public function it_still_falls_back_to_profile_years_for_total_experience_questions(): void
    {
        $label = 'How many years of experience do you have?';

        $this->assertTrue(YearsExperienceAnswerNormalizer::isGenericTotalExperienceQuestion($label));
        $this->assertSame('6', YearsExperienceAnswerNormalizer::normalize('', '6', $label));
    }

    #[Test]
    public function it_does_not_treat_years_threshold_yes_no_gates_as_numeric_years(): void
    {
        $label = 'Do you have 4+ years of experience as a full-time engineer?';

        $this->assertSame(4, YearsExperienceAnswerNormalizer::extractYearsExperienceThreshold($label));
        $this->assertFalse(YearsExperienceAnswerNormalizer::isYearsExperienceQuestion($label));
        $this->assertSame('Yes', YearsExperienceAnswerNormalizer::normalize('Yes', '2', $label));
        $this->assertSame('No', YearsExperienceAnswerNormalizer::normalize('No', '8', $label));
    }
}
