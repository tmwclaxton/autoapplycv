<?php

namespace App\Http\Controllers;

use App\Enums\SubscriptionTier;
use App\Services\AiTokenService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BillingController extends Controller
{
    public function __construct(
        private readonly AiTokenService $aiTokens,
    ) {}

    public function index(Request $request): Response
    {
        return Inertia::render('Billing', [
            'subscription' => $this->aiTokens->summary($request->user()),
            'plans' => SubscriptionTier::marketingPlans(),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Paid billing (GoCardless) — uncomment when Pro launches
    |--------------------------------------------------------------------------
    |
    | Also uncomment the matching routes in routes/web.php and restore
    | GoCardlessService injection in this controller's constructor.
    |
    | public function checkout(Request $request): RedirectResponse
    | {
    |     $validated = $request->validate([
    |         'tier' => ['required', 'in:free,pro'],
    |     ]);
    |
    |     $tier = SubscriptionTier::from($validated['tier']);
    |     $user = $request->user();
    |
    |     if (! $tier->isAvailable()) {
    |         return redirect()
    |             ->route('billing.index')
    |             ->with('success', 'That plan is not available yet.');
    |     }
    |
    |     if (! $tier->isPaid()) {
    |         if ($user->gocardless_subscription_id !== null || $user->gocardless_mandate_id !== null) {
    |             $this->goCardless->cancelSubscription($user);
    |
    |             return redirect()->route('billing.index')->with('success', 'You are on the Free plan.');
    |         }
    |
    |         if ($user->subscriptionTier() === $tier && $user->subscriptionStatus()->value === 'active') {
    |             return redirect()->route('billing.index')->with('success', 'You are already on the Free plan.');
    |         }
    |
    |         $user->forceFill([
    |             'subscription_tier' => SubscriptionTier::Free->value,
    |             'subscription_status' => SubscriptionStatus::Active->value,
    |         ])->save();
    |
    |         return redirect()->route('billing.index')->with('success', 'You are on the Free plan.');
    |     }
    |
    |     if ($user->subscriptionTier() === $tier && $user->subscriptionStatus()->value === 'active') {
    |         return redirect()->route('billing.index')->with('success', 'You are already on this plan.');
    |     }
    |
    |     $checkoutUrl = $this->goCardless->createCheckoutFlow($user, $tier);
    |
    |     return redirect()->away($checkoutUrl);
    | }
    |
    | public function complete(Request $request): RedirectResponse
    | {
    |     return redirect()
    |         ->route('billing.index')
    |         ->with('success', 'Direct Debit setup received. Your plan will activate once GoCardless confirms the mandate.');
    | }
    |
    | public function cancel(Request $request): RedirectResponse
    | {
    |     $this->goCardless->cancelSubscription($request->user());
    |
    |     return redirect()
    |         ->route('billing.index')
    |         ->with('success', 'Your subscription has been cancelled. You remain on the Free plan.');
    | }
    */
}
