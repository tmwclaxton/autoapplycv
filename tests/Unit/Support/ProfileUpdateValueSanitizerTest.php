<?php

namespace Tests\Unit\Support;

use App\Support\ProfileUpdateValueSanitizer;
use PHPUnit\Framework\TestCase;

class ProfileUpdateValueSanitizerTest extends TestCase
{
    public function test_rejects_meta_field_reference_values(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::shouldRejectDirectValue('location', 'field though'));
        $this->assertTrue(ProfileUpdateValueSanitizer::shouldRejectDirectValue('location', 'field'));
    }

    public function test_strips_conversational_filler_from_values(): void
    {
        $this->assertSame('High Wycombe', ProfileUpdateValueSanitizer::cleanCapturedValue('High Wycombe though'));
    }

    public function test_detects_location_field_meta_request(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::isLocationFieldMetaRequest('update my location field though'));
    }

    public function test_treats_apply_button_question_as_conversational(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::isConversationalOrQuestionMessage('where is the apply button'));
        $this->assertFalse(ProfileUpdateValueSanitizer::looksLikeProfileUpdateCommand('where is the apply button'));
    }

    public function test_does_not_treat_bare_name_questions_as_name_values(): void
    {
        $this->assertFalse(ProfileUpdateValueSanitizer::looksLikeBareNameValue('where is the apply button'));
    }

    public function test_accepts_real_name_follow_up_values(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::looksLikeBareNameValue('Marcus Webb'));
        $this->assertTrue(ProfileUpdateValueSanitizer::looksLikeBareNameValue('Toby Claxton'));
    }

    public function test_still_allows_explicit_update_commands_with_please(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::looksLikeProfileUpdateCommand('update my location to Bristol please'));
    }

    public function test_rejects_random_values_as_profile_value(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::shouldRejectDirectValue('summary', 'random values'));
    }

    public function test_strips_trailing_proposal_context_from_values(): void
    {
        $this->assertSame(
            'High Wycombe, Buckinghamshire',
            ProfileUpdateValueSanitizer::cleanCapturedValue('High Wycombe, Buckinghamshire based on your address'),
        );
    }

    public function test_treats_no_i_meant_correction_as_command(): void
    {
        $this->assertTrue(ProfileUpdateValueSanitizer::looksLikeProfileUpdateCommand('no I meant Bath not Bristol'));
    }
}
