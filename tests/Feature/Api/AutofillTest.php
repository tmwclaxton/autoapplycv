<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutofillTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_record_successful_field_fills(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/autofill', ['count' => 3])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('count', 3)
            ->assertJsonPath('subscription.autofills_used', 3)
            ->assertJsonPath('subscription.autofills_remaining', 247)
            ->assertJsonPath('extension_usage.fields_autofilled', 3);

        $this->assertSame(3, $user->fresh()->fields_autofilled);
    }

    public function test_autofill_requires_a_count(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/autofill', [])
            ->assertUnprocessable();
    }

    public function test_autofill_returns_402_when_requested_count_exceeds_remaining_allowance(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 248,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/autofill', ['count' => 5])
            ->assertStatus(402)
            ->assertJsonPath('success', false)
            ->assertJsonPath('subscription.autofills_remaining', 2);
    }

    public function test_autofill_returns_402_when_monthly_limit_is_reached(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/autofill', ['count' => 1])
            ->assertStatus(402)
            ->assertJsonPath('success', false)
            ->assertJsonPath('subscription.can_autofill', false);
    }
}
