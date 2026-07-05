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
}
