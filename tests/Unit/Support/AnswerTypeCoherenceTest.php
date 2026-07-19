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

    public function test_visa_location_label_is_not_treated_as_locality(): void
    {
        $profile = new CvProfile(['city' => 'High Wycombe']);

        $this->assertFalse(AnswerTypeCoherence::shouldReject(
            $profile,
            [
                'label' => "Do you need visa sponsorship for the role's location?",
                'field_type' => 'radio',
                'options' => ['Yes', 'No'],
            ],
            'No',
        ));

        // Without Yes/No options, a city string must not be rejected as locality bleed.
        $this->assertFalse(AnswerTypeCoherence::shouldReject(
            $profile,
            [
                'label' => "Do you need visa sponsorship for the role's location?",
                'field_type' => 'text',
            ],
            'High Wycombe',
        ));
    }

    public function test_rejects_worded_notice_on_salary_and_notice_on_years(): void
    {
        $profile = new CvProfile([]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Expected salary', 'field_type' => 'text'],
            'two weeks',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'How many years of experience do you have?', 'field_type' => 'text'],
            '2 weeks',
        ));
    }

    public function test_rejects_yes_no_on_multi_option_status_select(): void
    {
        $profile = new CvProfile([]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            [
                'label' => 'Please specify your current legal work authorization status.',
                'field_type' => 'select',
                'options' => [
                    'I am a Polish national',
                    'I hold a valid Polish work permit or visa',
                ],
            ],
            'Yes',
        ));
    }

    public function test_accepts_german_gehaltsvorstellungen_salary_amount(): void
    {
        $profile = new CvProfile([]);

        $this->assertFalse(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Gehaltsvorstellungen (brutto Jahresgehalt)', 'field_type' => 'number'],
            '55000',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Gehaltsvorstellungen (brutto Jahresgehalt)', 'field_type' => 'number'],
            '2 weeks',
        ));
    }

    public function test_rejects_bare_integer_on_polish_notice_and_notice_on_locality(): void
    {
        $profile = new CvProfile(['city' => 'High Wycombe']);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Jaki jest Twój okres wypowiedzenia?', 'field_type' => 'text'],
            '2',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'City, county', 'field_type' => 'text'],
            '2 weeks',
        ));
    }

    public function test_rejects_url_on_phone_and_salary_on_years_number(): void
    {
        $profile = new CvProfile([]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Phone number', 'field_type' => 'tel'],
            'https://linkedin.com/in/toby',
        ));

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'How many years of experience do you have?', 'field_type' => 'number'],
            '55000',
        ));
    }

    public function test_available_from_is_notice_and_rejects_bare_integer(): void
    {
        $profile = new CvProfile([]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Available from', 'field_type' => 'text'],
            '2',
        ));

        $this->assertFalse(AnswerTypeCoherence::shouldReject(
            $profile,
            ['label' => 'Available from', 'field_type' => 'text'],
            '2 weeks',
        ));
    }

    public function test_rejects_phone_on_mdm_essay_free_text(): void
    {
        $profile = new CvProfile([
            'phone' => '+447837370669',
        ]);

        $this->assertTrue(AnswerTypeCoherence::shouldReject(
            $profile,
            [
                'label' => 'Can you share an example of how you have used, troubleshooted or implemented mobile device management?',
                'field_type' => 'textarea',
            ],
            '+447837370669',
        ));
    }
}
