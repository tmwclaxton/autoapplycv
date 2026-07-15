<?php

namespace Tests\Unit\Support;

use App\Models\CvProfile;
use App\Models\User;
use App\Support\ProfileAnswerGrounding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileAnswerGroundingTest extends TestCase
{
    use RefreshDatabase;

    public function test_open_ended_text_question_needs_grounding(): void
    {
        $this->assertTrue(ProfileAnswerGrounding::questionNeedsGrounding([
            'label' => 'Share your GitHub or portfolio work',
            'field_type' => 'text',
            'max_chars' => 500,
        ]));
    }

    public function test_linkedin_url_question_does_not_need_grounding(): void
    {
        $this->assertFalse(ProfileAnswerGrounding::questionNeedsGrounding([
            'label' => 'LinkedIn URL',
            'field_type' => 'text',
            'max_chars' => 200,
        ]));
    }

    public function test_skill_years_question_does_not_need_grounding(): void
    {
        $this->assertFalse(ProfileAnswerGrounding::questionNeedsGrounding([
            'label' => 'How many years of work experience do you have with C++?',
            'field_type' => 'text',
        ]));
    }

    public function test_enforce_grounded_answers_keeps_skill_years_integer(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'skills' => ['PHP', 'Laravel'],
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Acme Corp',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                    'highlights' => ['Built Laravel APIs for internal tools'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
        ]);

        $questions = [[
            'label' => 'How many years of work experience do you have with C++?',
            'ref' => 'cpp-years',
            'field_type' => 'text',
        ]];

        $enforced = ProfileAnswerGrounding::enforceGroundedAnswers($profile, $questions, [[
            'label' => 'How many years of work experience do you have with C++?',
            'ref' => 'cpp-years',
            'answer' => '5',
        ]]);

        $this->assertSame('5', $enforced[0]['answer'] ?? null);
    }

    public function test_enforce_grounded_answers_rejects_invented_employer(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Acme Corp',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                    'highlights' => ['Built Laravel APIs for internal tools'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
        ]);

        $questions = [[
            'label' => 'Describe your security experience',
            'ref' => 'secops',
            'field_type' => 'text',
            'max_chars' => 500,
        ]];

        $enforced = ProfileAnswerGrounding::enforceGroundedAnswers($profile, $questions, [[
            'label' => 'Describe your security experience',
            'ref' => 'secops',
            'answer' => 'I built OAuth2 for a fintech platform using Node.js and PostgreSQL.',
        ]]);

        $this->assertNotEmpty(ProfileAnswerGrounding::profileEntities($profile));
        $this->assertCount(1, $enforced);
        $this->assertNull($enforced[0]['answer']);
    }

    public function test_enforce_grounded_answers_keeps_profile_backed_answer(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Acme Corp',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                    'highlights' => ['Built Laravel APIs for internal tools'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
        ]);

        $questions = [[
            'label' => 'Share your GitHub or portfolio work',
            'ref' => 'portfolio',
            'field_type' => 'text',
            'max_chars' => 500,
        ]];

        $answer = 'Most of my work at Acme Corp is private, but I built Laravel APIs for internal tools there.';

        $enforced = ProfileAnswerGrounding::enforceGroundedAnswers($profile, $questions, [[
            'label' => 'Share your GitHub or portfolio work',
            'ref' => 'portfolio',
            'answer' => $answer,
        ]]);

        $this->assertSame($answer, $enforced[0]['answer'] ?? null);
    }
}
