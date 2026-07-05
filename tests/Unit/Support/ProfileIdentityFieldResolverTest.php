<?php

namespace Tests\Unit\Support;

use App\Models\CvProfile;
use App\Models\User;
use App\Support\ProfileIdentityFieldResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileIdentityFieldResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolve_mapping_for_first_and_last_name_labels(): void
    {
        $this->assertSame(
            'full_name.first',
            ProfileIdentityFieldResolver::resolveMappingForLabel('First name')['path'] ?? null,
        );
        $this->assertSame(
            'full_name.last',
            ProfileIdentityFieldResolver::resolveMappingForLabel('Last name')['path'] ?? null,
        );
    }

    public function test_partition_questions_fills_identity_from_profile(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'toby@example.com',
            'phone' => '7700900123',
            'city' => 'High Wycombe',
        ]);

        $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, [
            ['label' => 'First name', 'ref' => 'f1', 'field_type' => 'text'],
            ['label' => 'Last name', 'ref' => 'f2', 'field_type' => 'text'],
            ['label' => 'Why do you want this role?', 'ref' => 'f3', 'field_type' => 'textarea'],
        ], ['phone_country_code' => '+44']);

        $this->assertCount(2, $partition['identity_answers']);
        $this->assertSame('Toby', $partition['identity_answers'][0]['answer'] ?? null);
        $this->assertSame('Claxton', $partition['identity_answers'][1]['answer'] ?? null);
        $this->assertCount(1, $partition['llm_questions']);
        $this->assertSame('Why do you want this role?', $partition['llm_questions'][0]['label'] ?? null);
    }

    public function test_resolve_mapping_for_teamtailor_glued_required_labels(): void
    {
        $this->assertSame(
            'full_name.first',
            ProfileIdentityFieldResolver::resolveMappingForLabel('first namerequired first namerequired')['path'] ?? null,
        );
        $this->assertSame(
            'full_name.last',
            ProfileIdentityFieldResolver::resolveMappingForLabel('last namerequired last namerequired')['path'] ?? null,
        );
        $this->assertSame(
            'email',
            ProfileIdentityFieldResolver::resolveMappingForLabel('emailrequired emailrequired')['path'] ?? null,
        );
        $this->assertSame(
            'phone',
            ProfileIdentityFieldResolver::resolveMappingForLabel('phonerequired phonerequired phone number with country code')['path'] ?? null,
        );
    }

    public function test_resolve_mapping_from_teamtailor_dom_hints(): void
    {
        $this->assertSame(
            'full_name.first',
            ProfileIdentityFieldResolver::resolveMappingForQuestion([
                'label' => 'unknown label',
                'dom' => ['id' => 'candidate_first_name', 'name' => 'candidate[first_name]'],
            ])['path'] ?? null,
        );
    }

    public function test_partition_questions_handles_teamtailor_identity_batch(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
            'phone' => '+447837370669',
            'city' => 'High Wycombe',
        ]);

        $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, [
            ['label' => 'first namerequired first namerequired', 'ref' => 'f1', 'field_type' => 'text'],
            ['label' => 'last namerequired last namerequired', 'ref' => 'f2', 'field_type' => 'text'],
            ['label' => 'emailrequired emailrequired', 'ref' => 'f3', 'field_type' => 'email'],
            [
                'label' => 'berätta lite kort om varför du fastnade för vekst',
                'ref' => 'f4',
                'field_type' => 'textarea',
            ],
        ]);

        $this->assertCount(3, $partition['identity_answers']);
        $this->assertSame('Toby', $partition['identity_answers'][0]['answer'] ?? null);
        $this->assertSame('Claxton', $partition['identity_answers'][1]['answer'] ?? null);
        $this->assertSame('tmwclaxton@gmail.com', $partition['identity_answers'][2]['answer'] ?? null);
        $this->assertCount(1, $partition['llm_questions']);
    }

    public function test_enforce_identity_answers_overrides_hallucinated_llm_values(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'toby@example.com',
        ]);

        $questions = [
            ['label' => 'First name', 'ref' => 'f1', 'field_type' => 'text'],
            ['label' => 'Email', 'ref' => 'f2', 'field_type' => 'email'],
        ];

        $enforced = ProfileIdentityFieldResolver::enforceIdentityAnswers($profile, $questions, [
            ['label' => 'First name', 'ref' => 'f1', 'answer' => 'Alex'],
            ['label' => 'Email', 'ref' => 'f2', 'answer' => 'alex.andersson@email.com'],
        ]);

        $this->assertSame('Toby', $enforced[0]['answer'] ?? null);
        $this->assertSame('toby@example.com', $enforced[1]['answer'] ?? null);
    }

    public function test_teamtailor_concatenated_required_labels_resolve_identity_fields(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
            'phone' => '7837370669',
        ]);

        $labels = [
            'first namerequired first namerequired' => 'full_name.first',
            'last namerequired last namerequired' => 'full_name.last',
            'emailrequired emailrequired' => 'email',
            'phonerequired phonerequired phone number with country code' => 'phone',
        ];

        foreach ($labels as $label => $expectedPath) {
            $mapping = ProfileIdentityFieldResolver::resolveMappingForLabel($label);

            $this->assertSame(
                $expectedPath,
                $mapping['path'] ?? null,
                "Expected {$expectedPath} for label: {$label}",
            );
        }

        $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, [
            ['label' => 'first namerequired first namerequired', 'ref' => 'f10', 'field_type' => 'text'],
            ['label' => 'last namerequired last namerequired', 'ref' => 'f11', 'field_type' => 'text'],
            ['label' => 'emailrequired emailrequired', 'ref' => 'f12', 'field_type' => 'email'],
            ['label' => 'in short, what is your main interest in vekst and this role?required', 'ref' => 'f2', 'field_type' => 'textarea'],
        ], ['phone_country_code' => '+44']);

        $this->assertSame('Toby', $partition['identity_answers'][0]['answer'] ?? null);
        $this->assertSame('Claxton', $partition['identity_answers'][1]['answer'] ?? null);
        $this->assertSame('tmwclaxton@gmail.com', $partition['identity_answers'][2]['answer'] ?? null);
        $this->assertCount(3, $partition['identity_answers']);
        $this->assertCount(1, $partition['llm_questions']);
    }

    public function test_dom_hints_resolve_teamtailor_candidate_fields(): void
    {
        $this->assertSame(
            'full_name.first',
            ProfileIdentityFieldResolver::resolveMappingFromDomHints([
                'id' => 'candidate_first_name',
                'name' => 'candidate[first_name]',
            ])['path'] ?? null,
        );
        $this->assertSame(
            'email',
            ProfileIdentityFieldResolver::resolveMappingFromDomHints([
                'id' => 'candidate_email',
                'name' => 'candidate[email]',
            ])['path'] ?? null,
        );
    }
}
