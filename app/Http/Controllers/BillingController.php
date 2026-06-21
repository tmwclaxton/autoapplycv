<?php

namespace App\Http\Controllers;

use App\Enums\SubscriptionTier;
use App\Services\AiTokenService;
use App\Services\GoCardlessService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BillingController extends Controller
{
    public function __construct(
        private readonly AiTokenService $aiTokens,
        private readonly GoCardlessService $goCardless,
    ) {}

    public function index(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('Billing', [
            'subscription' => $this->aiTokens->summary($user),
            'tiers' => SubscriptionTier::marketingTiers(),
        ]);
    }

    public function checkout(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'tier' => ['required', 'in:free,standard,pro,power'],
        ]);

        $tier = SubscriptionTier::from($validated['tier']);
        $user = $request->user();

        if ($user->subscriptionTier() === $tier && $user->subscriptionStatus()->value === 'active') {
            return redirect()->route('billing.index')->with('success', 'You are already on this plan.');
        }

        if (! $tier->isPaid()) {
            $this->goCardless->cancelSubscription($user);

            return redirect()->route('billing.index')->with('success', 'You are now on the Free plan.');
        }

        $checkoutUrl = $this->goCardless->createCheckoutFlow($user, $tier);

        return redirect()->away($checkoutUrl);
    }

    public function complete(Request $request): RedirectResponse
    {
        return redirect()
            ->route('billing.index')
            ->with('success', 'Direct Debit setup received. Your plan will activate once GoCardless confirms the mandate.');
    }

    public function cancel(Request $request): RedirectResponse
    {
        $this->goCardless->cancelSubscription($request->user());

        return redirect()
            ->route('billing.index')
            ->with('success', 'Your subscription has been cancelled. You remain on the Free plan.');
    }
}
