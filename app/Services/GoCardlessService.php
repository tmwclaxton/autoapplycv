<?php

namespace App\Services;

use App\Enums\SubscriptionStatus;
use App\Enums\SubscriptionTier;
use App\Models\User;
use GoCardlessPro\Client;
use GoCardlessPro\Core\Exception\ApiException;
use GoCardlessPro\Environment;
use GoCardlessPro\Resources\Event;
use Illuminate\Support\Carbon;
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

        $environment = config('services.gocardless.environment') ?: null;

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

    public function resumeCheckoutFlow(User $user): string
    {
        $billingRequestId = $user->gocardless_billing_request_id;

        if ($billingRequestId === null) {
            throw new InvalidArgumentException('No billing request to resume.');
        }

        $flow = $this->client()->billingRequestFlows()->create([
            'params' => [
                'redirect_uri' => route('billing.complete'),
                'exit_uri' => route('billing.index', ['checkout' => 'abandoned']),
                'links' => [
                    'billing_request' => $billingRequestId,
                ],
            ],
        ]);

        return $flow->authorisation_url;
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
            ],
        ]);

        $flow = $this->client()->billingRequestFlows()->create([
            'params' => [
                'redirect_uri' => route('billing.complete'),
                'exit_uri' => route('billing.index', ['checkout' => 'abandoned']),
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

    public function syncPendingCheckout(User $user): bool
    {
        $billingRequestId = $user->gocardless_billing_request_id;

        if ($billingRequestId === null) {
            return false;
        }

        $billingRequest = $this->client()->billingRequests()->get($billingRequestId);

        if ($billingRequest->status !== 'fulfilled') {
            return false;
        }

        $this->activateSubscriptionFromBillingRequest($user, $billingRequestId);

        return true;
    }

    public function activateSubscriptionFromBillingRequest(User $user, string $billingRequestId): void
    {
        if ($user->gocardless_billing_request_id !== $billingRequestId) {
            return;
        }

        $tierValue = $user->pending_subscription_tier ?? $user->subscription_tier;
        $tier = SubscriptionTier::resolve($tierValue);

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

    public function clearAbandonedCheckout(User $user): bool
    {
        if ($user->gocardless_billing_request_id === null) {
            return false;
        }

        if ($user->gocardless_subscription_id !== null) {
            $user->forceFill([
                'subscription_status' => SubscriptionStatus::Active->value,
                'pending_subscription_tier' => null,
                'gocardless_billing_request_id' => null,
            ])->save();

            return true;
        }

        if ($user->subscriptionTier() !== SubscriptionTier::Free) {
            $user->forceFill([
                'subscription_tier' => SubscriptionTier::Free->value,
                'subscription_status' => SubscriptionStatus::Active->value,
                'pending_subscription_tier' => null,
                'gocardless_billing_request_id' => null,
            ])->save();

            return true;
        }

        $user->forceFill([
            'subscription_status' => SubscriptionStatus::Active->value,
            'pending_subscription_tier' => null,
            'gocardless_billing_request_id' => null,
        ])->save();

        return true;
    }

    /**
     * @return 'activated'|'cleared'|null
     */
    public function reconcilePendingCheckout(User $user): ?string
    {
        if ($this->reconcileStuckPendingSubscription($user)) {
            return 'activated';
        }

        if ($user->gocardless_billing_request_id === null) {
            return null;
        }

        try {
            return $this->performCheckoutReconciliation($user);
        } catch (InvalidArgumentException) {
            return null;
        } catch (ApiException $exception) {
            Log::warning('GoCardless checkout reconciliation failed', [
                'user_id' => $user->id,
                'billing_request_id' => $user->gocardless_billing_request_id,
                'message' => $exception->getMessage(),
            ]);

            return null;
        } catch (\Throwable $exception) {
            Log::warning('GoCardless checkout reconciliation failed unexpectedly', [
                'user_id' => $user->id,
                'billing_request_id' => $user->gocardless_billing_request_id,
                'message' => $exception->getMessage(),
            ]);

            return null;
        }
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
            'subscription_status' => SubscriptionStatus::Active->value,
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

    public function reconcileStuckPendingSubscription(User $user): bool
    {
        if ($user->subscriptionStatus() !== SubscriptionStatus::Pending) {
            return false;
        }

        $subscriptionId = $user->gocardless_subscription_id;

        if ($subscriptionId === null) {
            return false;
        }

        try {
            $subscription = $this->client()->subscriptions()->get($subscriptionId);
        } catch (InvalidArgumentException) {
            return false;
        } catch (ApiException $exception) {
            Log::warning('Failed to reconcile stuck pending subscription', [
                'user_id' => $user->id,
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);

            return false;
        } catch (\Throwable $exception) {
            Log::warning('Failed to reconcile stuck pending subscription', [
                'user_id' => $user->id,
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);

            return false;
        }

        if (! in_array($subscription->status ?? null, ['active', 'customer_approval_granted'], true)) {
            return false;
        }

        $user->forceFill([
            'subscription_status' => SubscriptionStatus::Active->value,
            'pending_subscription_tier' => null,
            'gocardless_billing_request_id' => null,
        ])->save();

        return true;
    }

    /**
     * @return 'activated'|'cleared'|null
     */
    private function performCheckoutReconciliation(User $user): ?string
    {
        if ($this->syncPendingCheckout($user)) {
            return 'activated';
        }

        $billingRequestId = $user->gocardless_billing_request_id;

        try {
            $billingRequest = $this->client()->billingRequests()->get($billingRequestId);
        } catch (ApiException $exception) {
            if ($exception->getHttpStatusCode() === 404 && $this->clearAbandonedCheckout($user)) {
                return 'cleared';
            }

            throw $exception;
        }

        if ($billingRequest->status === 'fulfilled') {
            $this->activateSubscriptionFromBillingRequest($user, $billingRequestId);

            return 'activated';
        }

        if ($this->shouldClearAbandonedCheckout($billingRequest)) {
            $this->clearAbandonedCheckout($user);

            return 'cleared';
        }

        return null;
    }

    private function shouldClearAbandonedCheckout(object $billingRequest): bool
    {
        if ($billingRequest->status === 'cancelled') {
            return true;
        }

        if (! in_array($billingRequest->status, ['pending', 'ready_to_fulfil'], true)) {
            return false;
        }

        foreach ($billingRequest->actions ?? [] as $action) {
            if (in_array($action->status ?? null, ['failed', 'cancelled'], true)) {
                return true;
            }
        }

        if ($this->billingRequestFlowSessionEnded($billingRequest->id)) {
            return true;
        }

        return $this->billingRequestIsStale($billingRequest);
    }

    private function billingRequestFlowSessionEnded(string $billingRequestId): bool
    {
        try {
            $flows = $this->client()->billingRequestFlows()->list([
                'params' => [
                    'billing_request' => $billingRequestId,
                ],
            ]);
        } catch (ApiException $exception) {
            Log::warning('Failed to list GoCardless billing request flows', [
                'billing_request_id' => $billingRequestId,
                'message' => $exception->getMessage(),
            ]);

            return false;
        }

        if (count($flows->records) === 0) {
            return true;
        }

        $latestFlow = collect($flows->records)
            ->sortByDesc(fn ($flow) => $flow->created_at ?? '')
            ->first();

        return ($latestFlow->lock_status ?? null) === 'unlocked';
    }

    private function billingRequestIsStale(object $billingRequest): bool
    {
        if (! isset($billingRequest->created_at)) {
            return false;
        }

        try {
            return Carbon::parse($billingRequest->created_at)->lt(now()->subDay());
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @return array{
     *     next_payment_date: string|null,
     *     next_payment_amount: string|null,
     *     payments: array<int, array{
     *         id: string,
     *         charge_date: string,
     *         amount: string,
     *         status: string,
     *         status_label: string,
     *         description: string|null,
     *     }>,
     * }
     */
    public function billingHistory(User $user): array
    {
        $empty = [
            'next_payment_date' => null,
            'next_payment_amount' => null,
            'payments' => [],
        ];

        $subscriptionId = $user->gocardless_subscription_id;

        if ($subscriptionId === null || ! $user->subscriptionTier()->isPaid()) {
            return $empty;
        }

        try {
            $subscription = $this->client()->subscriptions()->get($subscriptionId);
        } catch (InvalidArgumentException) {
            return $empty;
        } catch (ApiException $exception) {
            Log::warning('Failed to fetch GoCardless subscription for billing history', [
                'user_id' => $user->id,
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);

            return $empty;
        } catch (\Throwable $exception) {
            Log::warning('Failed to fetch GoCardless subscription for billing history', [
                'user_id' => $user->id,
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);

            return $empty;
        }

        $nextPaymentDate = null;
        $nextPaymentAmount = null;
        $upcomingPayments = $subscription->upcoming_payments ?? [];

        if (count($upcomingPayments) > 0) {
            $nextPayment = $upcomingPayments[0];
            $nextPaymentDate = $nextPayment->charge_date ?? null;
            $nextPaymentAmount = isset($nextPayment->amount)
                ? $this->formatPaymentAmount((int) $nextPayment->amount, $subscription->currency ?? 'GBP')
                : null;
        }

        try {
            $payments = $this->client()->payments()->list([
                'params' => [
                    'subscription' => $subscriptionId,
                    'limit' => 24,
                ],
            ]);
        } catch (InvalidArgumentException) {
            return [
                'next_payment_date' => $nextPaymentDate,
                'next_payment_amount' => $nextPaymentAmount,
                'payments' => [],
            ];
        } catch (ApiException $exception) {
            Log::warning('Failed to fetch GoCardless payment history', [
                'user_id' => $user->id,
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);

            return [
                'next_payment_date' => $nextPaymentDate,
                'next_payment_amount' => $nextPaymentAmount,
                'payments' => [],
            ];
        } catch (\Throwable $exception) {
            Log::warning('Failed to fetch GoCardless payment history', [
                'user_id' => $user->id,
                'subscription_id' => $subscriptionId,
                'message' => $exception->getMessage(),
            ]);

            return [
                'next_payment_date' => $nextPaymentDate,
                'next_payment_amount' => $nextPaymentAmount,
                'payments' => [],
            ];
        }

        $records = collect($payments->records ?? [])
            ->sortByDesc(fn ($payment) => $payment->charge_date ?? '')
            ->values();

        return [
            'next_payment_date' => $nextPaymentDate,
            'next_payment_amount' => $nextPaymentAmount,
            'payments' => $records
                ->map(fn ($payment): array => [
                    'id' => (string) $payment->id,
                    'charge_date' => (string) ($payment->charge_date ?? ''),
                    'amount' => $this->formatPaymentAmount(
                        (int) ($payment->amount ?? 0),
                        (string) ($payment->currency ?? 'GBP'),
                    ),
                    'status' => (string) ($payment->status ?? 'unknown'),
                    'status_label' => $this->paymentStatusLabel((string) ($payment->status ?? 'unknown')),
                    'description' => $payment->description ?? null,
                ])
                ->all(),
        ];
    }

    private function formatPaymentAmount(int $amountInMinorUnits, string $currency): string
    {
        if (strtoupper($currency) !== 'GBP') {
            return number_format($amountInMinorUnits / 100, 2).' '.strtoupper($currency);
        }

        return '£'.number_format($amountInMinorUnits / 100, 2);
    }

    private function paymentStatusLabel(string $status): string
    {
        return match ($status) {
            'pending_submission' => 'Pending',
            'submitted' => 'Submitted',
            'confirmed' => 'Confirmed',
            'paid_out' => 'Paid',
            'cancelled' => 'Cancelled',
            'failed' => 'Failed',
            'charged_back' => 'Charged back',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }
}
