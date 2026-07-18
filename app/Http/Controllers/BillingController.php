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
            $cleared = $this->goCardless->clearAbandonedCheckout($request->user());
            $redirect = redirect()->route('billing.index');

            if ($cleared) {
                $redirect->with(
                    'success',
                    'Checkout cancelled. You remain on the Free plan.',
                );
            }

            return $redirect;
        }

        $user = $request->user();
        $reconciled = $this->goCardless->reconcilePendingCheckout($user);

        if ($reconciled === 'activated') {
            session()->flash(
                'success',
                'Your plan is active. The first month is charged now; renewals are collected monthly by Direct Debit.',
            );
        }

        $user = $user->fresh();

        return Inertia::render('Billing', [
            'subscription' => $this->usage->summary($user),
            'billing' => $this->goCardless->billingHistory($user),
            'plans' => SubscriptionTier::marketingPlans(),
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
                $this->goCardless->cancelSubscription($user);

                return redirect()->route('billing.index')->with('success', 'You are on the Free plan. Your Direct Debit has been cancelled.');
            }

            if ($user->subscriptionTier() === $tier && $user->subscriptionStatus()->value === 'active') {
                return redirect()->route('billing.index')->with('success', 'You are already on the Free plan.');
            }

            $user->forceFill([
                'subscription_tier' => SubscriptionTier::Free->value,
                'subscription_status' => SubscriptionStatus::Active->value,
            ])->save();

            return redirect()->route('billing.index')->with('success', 'You are on the Free plan.');
        }

        if ($user->subscriptionTier() === $tier && $user->subscriptionStatus()->value === 'active') {
            return redirect()->route('billing.index')->with('success', 'You are already on this plan.');
        }

        if ($this->canChangePaidPlanInPlace($user, $tier)) {
            return $this->changePaidPlanInPlace($user, $tier);
        }

        if ($user->gocardless_billing_request_id !== null) {
            $pendingTier = SubscriptionTier::resolve(
                $user->pending_subscription_tier ?? $user->subscription_tier,
            );

            if ($pendingTier === $tier) {
                try {
                    $checkoutUrl = $this->goCardless->resumeCheckoutFlow($user);
                } catch (InvalidArgumentException $exception) {
                    Log::error('Billing checkout resume misconfigured', [
                        'user_id' => $user->id,
                        'tier' => $tier->value,
                        'message' => $exception->getMessage(),
                    ]);

                    return redirect()
                        ->route('billing.index')
                        ->with('error', 'Billing is not configured yet. Please contact support.');
                } catch (ApiException $exception) {
                    Log::error('GoCardless checkout resume failed', [
                        'user_id' => $user->id,
                        'tier' => $tier->value,
                        'message' => $exception->getMessage(),
                        'errors' => $exception->getErrors(),
                    ]);

                    return redirect()
                        ->route('billing.index')
                        ->with('error', 'We could not resume bank payment setup. Please try again in a moment.');
                } catch (Throwable $exception) {
                    Log::error('Billing checkout resume failed', [
                        'user_id' => $user->id,
                        'tier' => $tier->value,
                        'message' => $exception->getMessage(),
                    ]);

                    return redirect()
                        ->route('billing.index')
                        ->with('error', 'Something went wrong resuming checkout. Please try again.');
                }

                return Inertia::location($checkoutUrl);
            }
        }

        try {
            $checkoutUrl = $this->goCardless->createCheckoutFlow($user, $tier);
        } catch (InvalidArgumentException $exception) {
            Log::error('Billing checkout misconfigured', [
                'user_id' => $user->id,
                'tier' => $tier->value,
                'message' => $exception->getMessage(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'Billing is not configured yet. Please contact support.');
        } catch (ApiException $exception) {
            Log::error('GoCardless checkout failed', [
                'user_id' => $user->id,
                'tier' => $tier->value,
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
                'message' => $exception->getMessage(),
            ]);

            return redirect()
                ->route('billing.index')
                ->with('error', 'Something went wrong starting checkout. Please try again.');
        }

        return Inertia::location($checkoutUrl);
    }

    public function complete(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($this->goCardless->syncPendingCheckout($user)) {
            return redirect()
                ->route('billing.index')
                ->with('success', 'Your plan is active. The first month is charged now; renewals are collected monthly by Direct Debit.');
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
        $this->goCardless->cancelSubscription($request->user());

        return redirect()
            ->route('billing.index')
            ->with('success', 'Your subscription has been cancelled. You remain on the Free plan.');
    }

    private function canChangePaidPlanInPlace(User $user, SubscriptionTier $tier): bool
    {
        return $tier->isPaid()
            && $user->subscriptionTier()->isPaid()
            && $user->subscriptionStatus() === SubscriptionStatus::Active
            && $user->gocardless_mandate_id !== null
            && $user->gocardless_subscription_id !== null;
    }

    private function changePaidPlanInPlace(User $user, SubscriptionTier $tier): RedirectResponse
    {
        $wasUpgrade = $this->planChange->isUpgrade($user, $tier);
        $wasDowngrade = $this->planChange->isDowngradeToPaid($user, $tier);
        $amountDuePence = $wasUpgrade
            ? $this->planChange->upgradeAmountDuePence($user, $tier)
            : 0;

        try {
            $this->goCardless->changePaidPlan($user, $tier, $amountDuePence);
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
                'amount_due_pence' => $amountDuePence,
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

        if ($wasUpgrade && $amountDuePence > 0) {
            $amount = '£'.number_format($amountDuePence / 100, 2);

            return redirect()
                ->route('billing.index')
                ->with(
                    'success',
                    'Upgraded to '.$tier->label().'. A Direct Debit of '.$amount.' will be collected for this period; renewals will be '.$tier->formattedPrice().'.',
                );
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
            return redirect()
                ->route('billing.index')
                ->with(
                    'success',
                    'Moved to '.$tier->label().'. Your Direct Debit renewals are now '.$tier->formattedPrice().'.',
                );
        }

        return redirect()
            ->route('billing.index')
            ->with('success', 'Your plan is now '.$tier->label().'.');
    }
}
