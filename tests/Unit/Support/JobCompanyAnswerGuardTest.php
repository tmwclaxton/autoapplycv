<?php

namespace Tests\Unit\Support;

use App\Models\CvProfile;
use App\Support\JobCompanyAnswerGuard;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class JobCompanyAnswerGuardTest extends TestCase
{
    #[Test]
    public function it_nulls_essay_that_names_wrong_apply_target_employer(): void
    {
        $profile = new CvProfile([
            'experience' => [
                [
                    'company' => 'CineArk',
                    'title' => 'AI Implementation Executive Associate',
                ],
                [
                    'company' => 'Rapid7',
                    'title' => 'Software Engineer',
                ],
            ],
        ]);

        $enforced = JobCompanyAnswerGuard::enforceAnswers(
            ['company' => 'Figma', 'title' => 'Software Engineer, AI Product'],
            $profile,
            [[
                'label' => 'additional information',
                'ref' => 'f11',
                'field_type' => 'textarea',
            ]],
            [[
                'label' => 'additional information',
                'ref' => 'f11',
                'answer' => 'At Rapid7 I migrated integrations to Kubernetes. I am eager to apply my background to the infrastructure engineering challenges at Optro.',
            ]],
        );

        $this->assertNull($enforced[0]['answer']);
    }

    #[Test]
    public function it_keeps_essay_that_targets_job_company_and_cites_past_employers(): void
    {
        $profile = new CvProfile([
            'experience' => [
                [
                    'company' => 'CineArk',
                    'title' => 'AI Implementation Executive Associate',
                ],
            ],
        ]);

        $answer = 'At CineArk as an AI Implementation Executive Associate I built production trackers. I want to join Figma to help ship AI product features.';

        $enforced = JobCompanyAnswerGuard::enforceAnswers(
            ['company' => 'Figma'],
            $profile,
            [[
                'label' => 'why do you want to join figma?',
                'ref' => 'f9',
                'field_type' => 'textarea',
            ]],
            [[
                'label' => 'why do you want to join figma?',
                'ref' => 'f9',
                'answer' => $answer,
            ]],
        );

        $this->assertSame($answer, $enforced[0]['answer']);
    }

    #[Test]
    public function it_allows_past_employer_phrases_without_job_company_when_no_wrong_target(): void
    {
        $profile = new CvProfile([
            'experience' => [
                ['company' => 'Rapid7', 'title' => 'Engineer'],
            ],
        ]);

        $answer = 'At Rapid7 as Engineer I led cloud migrations using Kubernetes and Terraform.';

        $this->assertFalse(JobCompanyAnswerGuard::shouldRejectWrongTargetEmployer(
            $answer,
            'Figma',
            ['rapid7'],
        ));
    }

    #[Test]
    public function it_extracts_apply_target_company_mentions(): void
    {
        $mentions = JobCompanyAnswerGuard::extractTargetEmployerMentions(
            'I am eager to apply my background to the infrastructure engineering challenges at Optro.',
        );

        $this->assertContains('Optro', $mentions);
    }
}
