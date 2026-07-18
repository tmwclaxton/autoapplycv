<?php

namespace Tests\Unit\Support;

use App\Models\CvProfile;
use App\Support\AnswerTypeCoherence;
use Tests\TestCase;

class AnswerTypeCoherenceTest extends TestCase
{
    public function test_rejects_yes_on_city_county_free_text(): void
    {
        $profile = new CvProfile([
            'city' => 'High Wycombe',
            'location' => 'Wycombe',
        ]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'City, county', 'field_type' => 'text'],
            'Yes',
        ));
    }

    public function test_allows_yes_on_explicit_yes_no_radio(): void
    {
        $profile = new CvProfile(['city' => 'High Wycombe']);

        $this->assertFalse(AnswerTypeCoherence::shouldReject(
            $profile,
            [
                'label' => 'Authorized to work in the UK?',
                'field_type' => 'radio',
                'options' => ['Yes', 'No'],
            ],
            'Yes',
        ));
    }

    public function test_rejects_salary_notice_bleed(): void
    {
        $profile = new CvProfile([]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Expected salary', 'field_type' => 'text'],
            '2 weeks',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Notice period', 'field_type' => 'text'],
            '55000',
        ));
    }

    public function test_nulls_locality_when_profile_city_empty(): void
    {
        $profile = new CvProfile([
            'city' => '',
            'location' => '',
        ]);

        $enforced = AnswerTypeCoherence::enforceCoherentAnswers(
            $profile,
            [['label' => 'City, county', 'ref' => 'cc', 'field_type' => 'text']],
            [['label' => 'City, county', 'ref' => 'cc', 'answer' => 'London']],
        );

        $this->assertNull($enforced[0]['answer']);
    }

    public function test_keeps_coherent_city_when_profile_has_city(): void
    {
        $profile = new CvProfile([
            'city' => 'High Wycombe',
            'location' => 'Wycombe',
        ]);

        $enforced = AnswerTypeCoherence::enforceCoherentAnswers(
            $profile,
            [['label' => 'City, county', 'ref' => 'cc', 'field_type' => 'text']],
            [['label' => 'City, county', 'ref' => 'cc', 'answer' => 'High Wycombe']],
        );

        $this->assertSame('High Wycombe', $enforced[0]['answer']);
    }

    public function test_rejects_contact_and_salary_bleed_on_locality(): void
    {
        $profile = new CvProfile(['city' => 'High Wycombe']);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'City, county', 'field_type' => 'text'],
            'tmwclaxton@gmail.com',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Email address', 'field_type' => 'email'],
            '+447700900123',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'What is your current salary?', 'field_type' => 'text'],
            '2 weeks',
        ));
    }

    public function test_rejects_url_on_locality(): void
    {
        $profile = new CvProfile(['city' => 'High Wycombe']);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'City, county', 'field_type' => 'text'],
            'https://linkedin.com/in/toby',
        ));
    }
}
