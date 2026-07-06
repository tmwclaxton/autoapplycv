<?php

namespace App\Services;

use App\Models\CreditGrant;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class AdminCreditAwardService
{
    public function __construct(
        private readonly AiTokenService $aiTokens,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function userCreditSummary(User $user): array
    {
        $this->aiTokens->ensureCurrentPeriod($user);
        $user->refresh();

        $planAllowance = max(0, $user->subscriptionTier()->monthlyCredits());
        $bonusCredits = max(0, (int) $user->bonus_autofills);
        $used = (int) $user->ai_tokens_used;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'subscription_tier' => $user->subscriptionTier()->label(),
            'subscription_status' => $user->subscriptionStatus()->label(),
            'monthly_credits' => $planAllowance,
            'bonus_credits' => $bonusCredits,
            'total_credit_allowance' => $planAllowance + $bonusCredits,
            'credits_used' => $used,
            'credits_remaining' => max(0, $planAllowance + $bonusCredits - $used),
        ];
    }

    public function award(User $recipient, User $admin, int $amount, ?string $note = null): CreditGrant
    {
        return DB::transaction(function () use ($recipient, $admin, $amount, $note): CreditGrant {
            $recipient->increment('bonus_autofills', $amount);

            return CreditGrant::query()->create([
                'user_id' => $recipient->id,
                'awarded_by_user_id' => $admin->id,
                'amount' => $amount,
                'note' => $note,
            ]);
        });
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function recentGrants(int $limit = 15): array
    {
        return CreditGrant::query()
            ->with([
                'user:id,name,email',
                'awardedBy:id,name,email',
            ])
            ->latest()
            ->limit($limit)
            ->get()
            ->map(fn (CreditGrant $grant): array => $grant->toAdminArray())
            ->values()
            ->all();
    }
}
