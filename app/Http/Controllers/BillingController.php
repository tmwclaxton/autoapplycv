<?php

namespace App\Http\Controllers;

use App\Enums\SubscriptionStatus;
use App\Enums\SubscriptionTier;
use App\Services\AiTokenService;
use App\Services\GoCardlessService;
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

        if ($reconciled === 'cleared') {
            session()->flash(
                'success',
                'Checkout cancelled. You remain on the Free plan.',
            );
        }

        if ($reconciled === 'activated') {
            session()->flash(
                'success',
                'Your plan is active. Direct Debit payments will be collected monthly.',
            );
        }

        return Inertia::render('Billing', [
            'subscription' => $this->usage->summary($user->fresh()),
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

                return redirect()->route('billing.index')->with('success', 'You are on the Free plan.');
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
                ->with('error', 'We could not start Direct Debit checkout. Please try again in a moment.');
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
                ->with('success', 'Your plan is active. Direct Debit payments will be collected monthly.');
        }

        if ($user->gocardless_billing_request_id !== null) {
            return redirect()
                ->route('billing.index')
                ->with('success', 'Direct Debit setup received. Your plan will activate once GoCardless confirms the mandate.');
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
}
