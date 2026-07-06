<?php

namespace Tests\Feature\Admin;

use App\Models\CreditGrant;
use App\Models\User;
use App\Services\AiTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class AdminCreditAwardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_non_admin_cannot_award_credits(): void
    {
        $user = User::factory()->create([
            'email' => 'someone@example.com',
        ]);

        $recipient = User::factory()->create([
            'email' => 'recipient@example.com',
        ]);

        $this->actingAs($user)
            ->post(route('admin.users.award-credits'), [
                'email' => $recipient->email,
                'amount' => 500,
            ])
            ->assertForbidden();
    }

    public function test_admin_can_lookup_user_credit_summary(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $recipient = User::factory()->create([
            'email' => 'recipient@example.com',
            'bonus_autofills' => 100,
            'ai_tokens_used' => 25,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->actingAs($admin)
            ->getJson(route('admin.users.lookup', ['email' => $recipient->email]))
            ->assertOk()
            ->assertJsonPath('user.email', $recipient->email)
            ->assertJsonPath('user.bonus_credits', 100)
            ->assertJsonPath('user.credits_used', 25)
            ->assertJsonPath('user.credits_remaining', 325);
    }

    public function test_admin_can_award_credit_package_to_user(): void
    {
        $admin = User::factory()->create([
            'email' => 'tobyclaxton@canvassr.org',
        ]);

        $recipient = User::factory()->create([
            'email' => 'recipient@example.com',
            'bonus_autofills' => 0,
        ]);

        $this->actingAs($admin)
            ->post(route('admin.users.award-credits'), [
                'email' => $recipient->email,
                'amount' => 2_500,
                'note' => 'Beta tester pack',
                'package_key' => 'standard',
            ])
            ->assertRedirect(route('admin.dashboard', ['tab' => 'users']))
            ->assertSessionHas('credit_award_success');

        $recipient->refresh();

        $this->assertSame(2_500, $recipient->bonus_autofills);

        $this->assertDatabaseHas('credit_grants', [
            'user_id' => $recipient->id,
            'awarded_by_user_id' => $admin->id,
            'amount' => 2_500,
            'note' => 'Beta tester pack',
        ]);
    }

    public function test_awarded_bonus_increases_autofill_allowance(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $recipient = User::factory()->create([
            'email' => 'recipient@example.com',
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->actingAs($admin)
            ->post(route('admin.users.award-credits'), [
                'email' => $recipient->email,
                'amount' => 500,
            ])
            ->assertRedirect();

        $summary = app(AiTokenService::class)->summary($recipient->fresh());

        $this->assertSame(500, $summary['bonus_credits']);
        $this->assertSame(750, $summary['total_credit_allowance']);
        $this->assertSame(500, $summary['credits_remaining']);
        $this->assertTrue($summary['can_use_credits']);
    }

    public function test_admin_dashboard_includes_credit_award_data(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $recipient = User::factory()->create([
            'email' => 'recipient@example.com',
        ]);

        CreditGrant::query()->create([
            'user_id' => $recipient->id,
            'awarded_by_user_id' => $admin->id,
            'amount' => 500,
            'note' => 'Support goodwill',
        ]);

        $this->actingAs($admin)
            ->get(route('admin.dashboard', ['tab' => 'users']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Dashboard')
                ->has('credit_packages')
                ->has('recent_credit_grants', 1)
                ->where('recent_credit_grants.0.amount', 500));
    }
}
