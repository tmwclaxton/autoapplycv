<?php

namespace Tests\Unit\Support;

use App\Models\CvProfile;
use App\Support\ExperienceThresholdAnswerGuard;
use App\Support\ProfileExperienceYears;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ExperienceThresholdAnswerGuardTest extends TestCase
{
    #[Test]
    public function it_computes_years_from_experience_timeline(): void
    {
        $profile = new CvProfile([
            'experience' => [
                [
                    'company' => 'Rapid7',
                    'title' => 'Software Engineer',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                ],
                [
                    'company' => 'CineArk',
                    'title' => 'Engineer',
                    'start_date' => '2018-06',
                    'end_date' => '2019-12',
                ],
            ],
        ]);

        $years = ProfileExperienceYears::yearsFromExperience($profile);

        $this->assertNotNull($years);
        $this->assertGreaterThanOrEqual(4, $years);
    }

    #[Test]
    public function it_uses_max_of_settings_and_experience_years(): void
    {
        $profile = new CvProfile([
            'experience' => [
                [
                    'company' => 'Rapid7',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                ],
            ],
        ]);

        $this->assertGreaterThanOrEqual(
            4,
            ProfileExperienceYears::effectiveYears($profile, ['years_of_experience' => '2']),
        );
    }

    #[Test]
    public function it_upgrades_no_to_yes_when_experience_meets_threshold(): void
    {
        $profile = new CvProfile([
            'experience' => [
                [
                    'company' => 'Rapid7',
                    'title' => 'Software Engineer',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                ],
            ],
        ]);

        $enforced = ExperienceThresholdAnswerGuard::enforceAnswers(
            $profile,
            ['years_of_experience' => '2'],
            [[
                'label' => 'do you have 4+ years of experience as a full-time engineer?',
                'ref' => 'f1',
                'field_type' => 'radio',
                'options' => ['Yes', 'No'],
            ]],
            [[
                'label' => 'do you have 4+ years of experience as a full-time engineer?',
                'ref' => 'f1',
                'answer' => 'No',
            ]],
        );

        $this->assertSame('Yes', $enforced[0]['answer']);
    }

    #[Test]
    public function it_keeps_no_when_timeline_is_below_threshold(): void
    {
        $profile = new CvProfile([
            'experience' => [
                [
                    'company' => 'Startup',
                    'start_date' => '2025-01',
                    'end_date' => 'Present',
                ],
            ],
        ]);

        $enforced = ExperienceThresholdAnswerGuard::enforceAnswers(
            $profile,
            ['years_of_experience' => '1'],
            [[
                'label' => 'do you have 4+ years of experience as a full-time engineer?',
                'ref' => 'f1',
                'field_type' => 'radio',
                'options' => ['Yes', 'No'],
            ]],
            [[
                'label' => 'do you have 4+ years of experience as a full-time engineer?',
                'ref' => 'f1',
                'answer' => 'No',
            ]],
        );

        $this->assertSame('No', $enforced[0]['answer']);
    }
}
