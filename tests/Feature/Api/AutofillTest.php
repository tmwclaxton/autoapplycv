<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutofillTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_record_an_autofill(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/autofill')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('subscription.autofills_used', 1)
            ->assertJsonPath('subscription.autofills_remaining', 249);
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
            ->postJson('/api/autofill')
            ->assertStatus(402)
            ->assertJsonPath('success', false)
            ->assertJsonPath('subscription.can_autofill', false);
    }
}
