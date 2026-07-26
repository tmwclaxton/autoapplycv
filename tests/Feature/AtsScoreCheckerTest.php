<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\NanoGptService;
use App\Support\AiAssistCosts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class AtsScoreCheckerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_ats_score_checker_page_shares_guest_quota_props(): void
    {
        $this->get(route('tools.ats-score-checker'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Tools/AtsScoreChecker')
                ->where('atsScoreCost', AiAssistCosts::atsScoreCost())
                ->where('guestFreeUsesLimit', (int) config('cv.ats_score_checker.guest_free_uses'))
                ->where('guestFreeUsesRemaining', (int) config('cv.ats_score_checker.guest_free_uses'))
            );
    }

    public function test_guest_can_score_using_same_assist_service_and_uses_are_counted(): void
    {
        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'score' => 74,
                'matched_keywords' => ['Laravel', 'PHP'],
                'missing_keywords' => ['Kubernetes'],
                'suggestions' => ['Mention cloud deployment if relevant.'],
            ]);
        });

        $this->postJson(route('tools.ats-score-checker.score'), [
            'cv_text' => str_repeat('Laravel PHP engineer with production APIs. ', 3),
            'job_description' => str_repeat('Looking for a Laravel developer with PHP experience. ', 2),
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('result.score', 74)
            ->assertJsonPath('credit_cost', 0)
            ->assertJsonPath('guest_free_uses_remaining', ((int) config('cv.ats_score_checker.guest_free_uses')) - 1);

        $this->assertSame(
            1,
            (int) session(config('cv.ats_score_checker.session_key')),
        );
    }

    public function test_guest_is_blocked_after_free_limit(): void
    {
        $limit = (int) config('cv.ats_score_checker.guest_free_uses');
        $sessionKey = (string) config('cv.ats_score_checker.session_key');

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->withSession([$sessionKey => $limit])
            ->postJson(route('tools.ats-score-checker.score'), [
                'cv_text' => str_repeat('Laravel PHP engineer with production APIs. ', 3),
                'job_description' => str_repeat('Looking for a Laravel developer with PHP experience. ', 2),
            ])
            ->assertStatus(429)
            ->assertJsonPath('success', false)
            ->assertJsonPath('guest_limit_reached', true)
            ->assertJsonPath('guest_free_uses_remaining', 0);
    }

    public function test_authenticated_user_is_charged_credits_like_extension(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 0,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        $cost = AiAssistCosts::atsScoreCost();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'score' => 81,
                'matched_keywords' => ['Laravel'],
                'missing_keywords' => [],
                'suggestions' => ['Keep quantifying impact.'],
            ]);
        });

        $this->actingAs($user)
            ->postJson(route('tools.ats-score-checker.score'), [
                'cv_text' => str_repeat('Laravel PHP engineer with production APIs. ', 3),
                'job_description' => str_repeat('Looking for a Laravel developer with PHP experience. ', 2),
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('result.score', 81)
            ->assertJsonPath('credit_cost', $cost);

        $this->assertSame($cost, $user->fresh()->ai_tokens_used);
        $this->assertNull(session(config('cv.ats_score_checker.session_key')));
    }

    public function test_authenticated_user_with_insufficient_credits_gets_402(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 1500,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->actingAs($user)
            ->postJson(route('tools.ats-score-checker.score'), [
                'cv_text' => str_repeat('Laravel PHP engineer with production APIs. ', 3),
                'job_description' => str_repeat('Looking for a Laravel developer with PHP experience. ', 2),
            ])
            ->assertStatus(402)
            ->assertJsonPath('success', false)
            ->assertJsonPath('credit_cost', AiAssistCosts::atsScoreCost());
    }

    public function test_authenticated_page_hides_guest_remaining(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('tools.ats-score-checker'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Tools/AtsScoreChecker')
                ->where('guestFreeUsesRemaining', null)
                ->where('atsScoreCost', AiAssistCosts::atsScoreCost())
            );
    }
}
