<?php

namespace App\Services;

use App\Enums\SubscriptionStatus;
use App\Enums\SubscriptionTier;
use App\Models\User;
use GoCardlessPro\Client;
use GoCardlessPro\Environment;
use GoCardlessPro\Resources\Event;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

class GoCardlessService
{
    private ?Client $client = null;

    public function client(): Client
    {
        if ($this->client !== null) {
            return $this->client;
        }

        $accessToken = config('services.gocardless.access_token');

        if (empty($accessToken)) {
            throw new InvalidArgumentException('GoCardless access token is not configured.');
        }

        $environment = config('services.gocardless.environment');

        if ($environment === null) {
            $environment = str_starts_with($accessToken, 'live_')
                ? Environment::LIVE
                : Environment::SANDBOX;
        }

        $this->client = new Client([
            'access_token' => $accessToken,
            'environment' => $environment,
        ]);

        return $this->client;
    }

    public function createCheckoutFlow(User $user, SubscriptionTier $tier): string
    {
        if (! $tier->isPaid()) {
            throw new InvalidArgumentException('Cannot create a GoCardless checkout for a free tier.');
        }

        $billingRequest = $this->client()->billingRequests()->create([
            'params' => [
                'mandate_request' => [
                    'scheme' => 'bacs',
                    'metadata' => [
                        'user_id' => (string) $user->id,
                        'tier' => $tier->value,
                    ],
                ],
                'subscription_request' => [
                    'amount' => $tier->pricePence(),
                    'currency' => 'GBP',
                    'name' => 'AutoCVApply '.$tier->label(),
                    'interval_unit' => 'monthly',
                    'interval' => 1,
                    'metadata' => [
                        'user_id' => (string) $user->id,
                        'tier' => $tier->value,
                    ],
                ],
            ],
        ]);

        $flow = $this->client()->billingRequestFlows()->create([
            'params' => [
                'redirect_uri' => route('billing.complete'),
                'exit_uri' => route('billing.index'),
                'links' => [
                    'billing_request' => $billingRequest->id,
                ],
            ],
        ]);

        $user->forceFill([
            'pending_subscription_tier' => $tier->value,
            'gocardless_billing_request_id' => $billingRequest->id,
            'subscription_status' => SubscriptionStatus::Pending->value,
        ])->save();

        return $flow->authorisation_url;
    }

    public function activateSubscriptionFromBillingRequest(User $user, string $billingRequestId): void
    {
        if ($user->gocardless_billing_request_id !== $billingRequestId) {
            return;
        }

        $tierValue = $user->pending_subscription_tier ?? $user->subscription_tier;
        $tier = SubscriptionTier::from($tierValue);

        if (! $tier->isPaid()) {
            return;
        }

        $billingRequest = $this->client()->billingRequests()->get($billingRequestId);
        $links = $billingRequest->links;
        $mandateId = $links->mandate ?? $links->mandate_request_mandate ?? null;
        $subscriptionId = $links->subscription ?? $links->subscription_request_subscription ?? null;

        if ($mandateId === null && $subscriptionId === null) {
            Log::warning('GoCardless billing request fulfilled without mandate or subscription', [
                'billing_request_id' => $billingRequestId,
                'user_id' => $user->id,
            ]);

            return;
        }

        if ($user->gocardless_subscription_id !== null && $user->gocardless_subscription_id !== $subscriptionId) {
            $this->cancelRemoteSubscription($user->gocardless_subscription_id);
        }

        if ($subscriptionId === null && $mandateId !== null) {
            $subscription = $this->client()->subscriptions()->create([
                'params' => [
                    'amount' => $tier->pricePence(),
                    'currency' => 'GBP',
                    'name' => 'AutoCVApply '.$tier->label(),
                    'interval_unit' => 'monthly',
                    'interval' => 1,
                    'day_of_month' => '1',
                    'metadata' => [
                        'user_id' => (string) $user->id,
                        'tier' => $tier->value,
                    ],
                    'links' => [
                        'mandate' => $mandateId,
                    ],
                ],
            ]);

            $subscriptionId = $subscription->id;
        }

        $user->forceFill([
            'subscription_tier' => $tier->value,
            'subscription_status' => SubscriptionStatus::Active->value,
            'gocardless_mandate_id' => $mandateId,
            'gocardless_subscription_id' => $subscriptionId,
            'pending_subscription_tier' => null,
            'gocardless_billing_request_id' => null,
        ])->save();
    }

    public function cancelSubscription(User $user): void
    {
        if ($user->gocardless_subscription_id !== null) {
            $this->cancelRemoteSubscription($user->gocardless_subscription_id);
        }

        $user->forceFill([
            'subscription_tier' => SubscriptionTier::Free->value,
            'subscription_status' => SubscriptionStatus::Active->value,
            'gocardless_subscription_id' => null,
            'gocardless_mandate_id' => null,
            'pending_subscription_tier' => null,
            'gocardless_billing_request_id' => null,
        ])->save();
    }

    public function handleEvent(Event $event): void
    {
        if ($event->resource_type === 'billing_requests' && $event->action === 'fulfilled') {
            $this->handleBillingRequestFulfilled($event);

            return;
        }

        if ($event->resource_type === 'subscriptions' && in_array($event->action, ['cancelled', 'finished'], true)) {
            $this->handleSubscriptionEnded($event);
        }
    }

    private function handleBillingRequestFulfilled(Event $event): void
    {
        $billingRequestId = $event->links->billing_request ?? null;

        if ($billingRequestId === null) {
            return;
        }

        $user = User::query()
            ->where('gocardless_billing_request_id', $billingRequestId)
            ->first();

        if ($user === null) {
            return;
        }

        $this->activateSubscriptionFromBillingRequest($user, $billingRequestId);
    }

    private function handleSubscriptionEnded(Event $event): void
    {
        $subscriptionId = $event->links->subscription ?? null;

        if ($subscriptionId === null) {
            return;
        }

        $user = User::query()
            ->where('gocardless_subscription_id', $subscriptionId)
            ->first();

        if ($user === null) {
            return;
        }

        $user->forceFill([
            'subscription_tier' => SubscriptionTier::Free->value,
            'subscription_status' => SubscriptionStatus::Cancelled->value,
            'gocardless_subscription_id' => null,
        ])->save();
    }

    private function cancelRemoteSubscription(string $subscriptionId): void
    {
        try {
            $this->client()->subscriptions()->cancel($subscriptionId);
        } catch (\Throwable $exception) {
            Log::warning('Failed to cancel GoCardless subscription', [
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
