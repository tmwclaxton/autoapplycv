<?php

namespace App\Http\Controllers;

use App\Enums\SubscriptionStatus;
use App\Enums\SubscriptionTier;
use App\Models\User;
use App\Services\AiTokenService;
use App\Services\GoCardlessService;
use App\Services\PlanChangeCalculator;
use GoCardlessPro\Core\Exception\ApiException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response as HttpFoundationResponse;
use Throwable;

class BillingController extends Controller
{
    public function __construct(
        private readonly AiTokenService $usage,
        private readonly GoCardlessService $goCardless,
        private readonly PlanChangeCalculator $planChange,
    ) {}

    public function index(Request $request): Response|RedirectResponse
    {
        if ($request->query('checkout') === 'abandoned') {
            $user = $request->user();
            $hadPaidPlan = $user->gocardless_subscription_id !== null;
            $cleared = $this->goCardless->clearAbandonedCheckout($user);
            $redirect = redirect()->route('billing.index');

            if ($cleared) {
                $redirect->with(
                    'success',
                    $hadPaidPlan
                        ? 'Checkout cancelled. Your current plan is unchanged.'
                        : 'Checkout cancelled. You remain on the Free plan.',
                );
            }

            return $redirect;
        }

        $user = $request->user();
        $reconciled = $this->goCardless->reconcilePendingCheckout($user);

        if ($reconciled === 'activated') {
            session()->flash('success', 'Your plan is active.');
        }

        $user = $user->fresh();

        return Inertia::render('Billing', [
            'subscription' => $this->usage->summary($user),
            'billing' => $this->goCardless->billingHistory($user),
            'plans' => SubscriptionTier::marketingPlans(),
            'plan_change_confirmations' => $this->planChange->checkoutConfirmations($user),
        ]);
    }

    public function checkout(Request $request): HttpFoundationResponse
    {
        $validated = $request->validate([
            'tier' => ['required', 'in:free,starter,pro'],
        ]);

        $tier = SubscriptionTier::from($validated['tier']);
        $user = $request->user();

        if (! $tier->isAvailable()) {
            return redirect()
                ->route('billing.index')
                ->with('success', 'That plan is not available yet.');
        }

        if (! $tier->isPaid()) {
            if ($user->gocardless_subscription_id !== null || $user->gocardless_mandate_id !== null) {
                $currentTier = $user->subscriptionTier();
                $resetsAt = $this->periodResetLabel($user);
                $this->goCardless->cancelSubscription($user);

                return redirect()
                    ->route('billing.index')
                    ->with(
                        'success',
                        'Your Direct Debit has been cancelled. You keep '.$currentTier->label().' benefits until '.$resetsAt.', then move to Free.',
                    );
            }

            if ($user->subscriptionTier() === $tier && $user->subscriptionStatus()->value === 'active') {
                return redirect()->route('billing.index')->with('success', 'You are already on the Free plan.');
            }

            if ($user->subscriptionTier()->isPaid()
                && $user->scheduled_subscription_tier === SubscriptionTier::Free->value) {
                return redirect()
                    ->route('billing.index')
                    ->with(
                        'success',
                        'You already move to Free on '.$this->periodResetLabel($user).'. You keep '.$user->subscriptionTier()->label().' benefits until then.',
                    );
            }

            $user->forceFill([
                'subscription_tier' => SubscriptionTier::Free->value,
                'scheduled_subscription_tier' => null,
                'subscription_status' => SubscriptionStatus::Active->value,
            ])->save();

            return redirect()->route('billing.index')->with('success', 'You are on the Free plan.');
        }

        if ($user->subscriptionTier() === $tier
            && $user->subscriptionStatus() === SubscriptionStatus::Active
            && $user->gocardless_billing_request_id === null) {
            if ($user->scheduled_subscription_tier !== null) {
                $user->forceFill([
                    'scheduled_subscription_tier' => null,
                ])->save();

                return redirect()
                    ->route('billing.index')
                    ->with(
                        'success',
                        'Scheduled plan change cancelled. You remain on '.$tier->label().'.',
                    );
            }

            return redirect()->route('billing.index')->with('success', 'You are already on this plan.');
        }

        // Existing Direct Debit customers: upgrades with an amount due go through Instant
        // Bank Pay. Downgrades (and zero-cost upgrades) update the subscription in place.
        if ($this->canChangePaidPlanInPlace($user, $tier)) {
            if ($user->gocardless_billing_request_id !== null
                || $user->subscriptionStatus() === SubscriptionStatus::Pending) {
                $pendingTier = SubscriptionTier::resolve(
                    $user->pending_subscription_tier ?? $user->subscription_tier,
                );

                if ($pendingTier === $tier
                    && $user->gocardless_billing_request_id !== null
                    && $this->planChange->isUpgrade($user, $tier)
                    && $this->planChange->upgradeAmountDuePence($user, $tier) > 0) {
                    return $this->redirectToCheckoutUrl(
                        fn () => $this->goCardless->resumeCheckoutFlow($user),
                        $user,
                        $tier,
                        'resume',
                    );
                }

                $user->forceFill([
                    'subscription_status' => SubscriptionStatus::Active->value,
                    'pending_subscription_tier' => null,
                    'gocardless_billing_request_id' => null,
                ])->save();
                $user = $user->fresh();
            }

            if ($this->planChange->isUpgrade($user, $tier)) {
                $amountDuePence = $this->planChange->upgradeAmountDuePence($user, $tier);

                if ($amountDuePence > 0) {
                    return $this->redirectToCheckoutUrl(
                        fn () => $this->goCardless->createUpgradeCheckoutFlow($user, $tier, $amountDuePence),
                        $user,
                        $tier,
                        'upgrade',
                    );
                }
            }

            return $this->changePaidPlanInPlace($user, $tier);
        }

        if ($user->gocardless_billing_request_id !== null) {
            $pendingTier = SubscriptionTier::resolve(
                $user->pending_subscription_tier ?? $user->subscription_tier,
            );

            if ($pendingTier === $tier) {
                return $this->redirectToCheckoutUrl(
                    fn () => $this->goCardless->resumeCheckoutFlow($user),
                    $user,
                    $tier,
                    'resume',
                );
            }
        }

        // Paid users without a stored mandate/subscription must not silently start a
        // duplicate signup - surface the problem instead.
        if ($user->subscriptionTier()->isPaid()) {
            Log::error('Paid user missing GoCardless mandate or subscription for plan change', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'mandate_id' => $user->gocardless_mandate_id,
                'subscription_id' => $user->gocardless_subscription_id,
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'We could not update your plan because billing details are incomplete. Please contact support.');
        }

        return $this->redirectToCheckoutUrl(
            fn () => $this->goCardless->createCheckoutFlow($user, $tier),
            $user,
            $tier,
            'subscribe',
        );
    }

    public function complete(Request $request): RedirectResponse
    {
        $user = $request->user();
        $wasPaidUpgrade = $user->gocardless_subscription_id !== null
            && $user->gocardless_billing_request_id !== null
            && $user->pending_subscription_tier !== null
            && $user->subscriptionTier()->isPaid();

        if ($this->goCardless->syncPendingCheckout($user)) {
            $tier = $user->fresh()->subscriptionTier();

            return redirect()
                ->route('billing.index')
                ->with(
                    'success',
                    $wasPaidUpgrade
                        ? 'Upgraded to '.$tier->label().'. Renewals will be '.$tier->formattedPrice().'.'
                        : 'Your plan is active. The first month is charged now; renewals are collected monthly by Direct Debit.',
                );
        }

        if ($user->gocardless_billing_request_id !== null) {
            return redirect()
                ->route('billing.index')
                ->with('success', 'Bank payment setup received. Your plan will activate once GoCardless confirms payment.');
        }

        return redirect()
            ->route('billing.index')
            ->with('success', 'Billing setup finished.');
    }

    public function cancel(Request $request): RedirectResponse
    {
        $user = $request->user();
        $currentTier = $user->subscriptionTier();
        $resetsAt = $this->periodResetLabel($user);

        $this->goCardless->cancelSubscription($user);

        if ($currentTier->isPaid()) {
            return redirect()
                ->route('billing.index')
                ->with(
                    'success',
                    'Your Direct Debit has been cancelled. You keep '.$currentTier->label().' benefits until '.$resetsAt.', then move to Free.',
                );
        }

        return redirect()
            ->route('billing.index')
            ->with('success', 'Your subscription has been cancelled. You remain on the Free plan.');
    }

    private function canChangePaidPlanInPlace(User $user, SubscriptionTier $tier): bool
    {
        return $tier->isPaid()
            && $user->subscriptionTier()->isPaid()
            && $user->gocardless_mandate_id !== null
            && $user->gocardless_subscription_id !== null;
    }

    private function redirectToCheckoutUrl(
        callable $createUrl,
        User $user,
        SubscriptionTier $tier,
        string $context,
    ): HttpFoundationResponse {
        try {
            $checkoutUrl = $createUrl();
        } catch (InvalidArgumentException $exception) {
            Log::error('Billing checkout misconfigured', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'context' => $context,
                'message' => $exception->getMessage(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'Billing is not configured yet. Please contact support.');
        } catch (ApiException $exception) {
            Log::error('GoCardless checkout failed', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'context' => $context,
                'message' => $exception->getMessage(),
                'errors' => $exception->getErrors(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'We could not start bank payment checkout. Please try again in a moment.');
        } catch (Throwable $exception) {
            Log::error('Billing checkout failed', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'context' => $context,
                'message' => $exception->getMessage(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'Something went wrong starting checkout. Please try again.');
        }

        return Inertia::location($checkoutUrl);
    }

    private function changePaidPlanInPlace(User $user, SubscriptionTier $tier): RedirectResponse
    {
        $wasUpgrade = $this->planChange->isUpgrade($user, $tier);
        $wasDowngrade = $this->planChange->isDowngradeToPaid($user, $tier);

        try {
            $this->goCardless->changePaidPlan($user, $tier);
        } catch (InvalidArgumentException $exception) {
            Log::error('Paid plan change misconfigured', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'message' => $exception->getMessage(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'Billing is not configured yet. Please contact support.');
        } catch (ApiException $exception) {
            Log::error('GoCardless paid plan change failed', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'message' => $exception->getMessage(),
                'errors' => $exception->getErrors(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'We could not update your plan. Please try again in a moment.');
        } catch (Throwable $exception) {
            Log::error('Paid plan change failed', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'message' => $exception->getMessage(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'Something went wrong updating your plan. Please try again.');
        }

        if ($wasUpgrade) {
            return redirect()
                ->route('billing.index')
                ->with(
                    'success',
                    'Upgraded to '.$tier->label().'. Renewals will be '.$tier->formattedPrice().'.',
                );
        }

        if ($wasDowngrade) {
            $resetsAt = $this->periodResetLabel($user);

            return redirect()
                ->route('billing.index')
                ->with(
                    'success',
                    'Your plan switches to '.$tier->label().' on '.$resetsAt.'. You keep your current benefits until then. Renewals are now '.$tier->formattedPrice().'.',
                );
        }

        return redirect()
            ->route('billing.index')
            ->with('success', 'Your plan is now '.$tier->label().'.');
    }

    private function periodResetLabel(User $user): string
    {
        $periodStart = $user->ai_tokens_period_start;

        $resetsAt = $periodStart !== null
            ? Carbon::parse($periodStart)->addMonth()->startOfMonth()
            : now()->addMonth()->startOfMonth();

        return $resetsAt->format('j M Y');
    }
}
