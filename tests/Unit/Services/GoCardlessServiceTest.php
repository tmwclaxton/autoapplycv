<?php

namespace Tests\Unit\Services;

use App\Enums\SubscriptionTier;
use App\Models\User;
use App\Services\GoCardlessService;
use GoCardlessPro\Client;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use ReflectionClass;
use Tests\TestCase;

class GoCardlessServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_checkout_flow_requests_instant_payment_and_mandate(): void
    {
        $user = User::factory()->create();

        $billingRequests = Mockery::mock();
        $billingRequests->shouldReceive('create')
            ->once()
            ->with(Mockery::on(function (array $payload) use ($user): bool {
                $params = $payload['params'] ?? [];

                return ($params['payment_request']['scheme'] ?? null) === 'faster_payments'
                    && ($params['payment_request']['currency'] ?? null) === 'GBP'
                    && ($params['payment_request']['amount'] ?? null) === SubscriptionTier::Starter->pricePence()
                    && ($params['mandate_request']['scheme'] ?? null) === 'bacs'
                    && ($params['mandate_request']['metadata']['user_id'] ?? null) === (string) $user->id
                    && ($params['mandate_request']['metadata']['tier'] ?? null) === 'starter';
            }))
            ->andReturn((object) ['id' => 'BRQ123']);

        $billingRequestFlows = Mockery::mock();
        $billingRequestFlows->shouldReceive('create')
            ->once()
            ->andReturn((object) ['authorisation_url' => 'https://pay.gocardless.com/flow/test']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('billingRequests')->andReturn($billingRequests);
        $client->shouldReceive('billingRequestFlows')->andReturn($billingRequestFlows);

        $service = $this->serviceWithClient($client);
        $url = $service->createCheckoutFlow($user, SubscriptionTier::Starter);

        $this->assertSame('https://pay.gocardless.com/flow/test', $url);

        $user->refresh();

        $this->assertSame('starter', $user->pending_subscription_tier);
        $this->assertSame('BRQ123', $user->gocardless_billing_request_id);
        $this->assertSame('pending', $user->subscription_status);
        $this->assertSame('BRQ123', session('pending_purchase_conversion.transaction_id'));
        $this->assertSame(7.0, session('pending_purchase_conversion.value'));
        $this->assertSame('starter', session('pending_purchase_conversion.item_id'));
    }

    public function test_flash_pending_purchase_conversion_moves_payload_to_flash(): void
    {
        session([
            'pending_purchase_conversion' => [
                'transaction_id' => 'BRQ123',
                'value' => 7.0,
                'currency' => 'GBP',
                'item_id' => 'starter',
                'item_name' => 'AutoCVApply Starter',
            ],
        ]);

        $payload = (new GoCardlessService)->flashPendingPurchaseConversion();

        $this->assertSame('BRQ123', $payload['transaction_id'] ?? null);
        $this->assertNull(session('pending_purchase_conversion'));
        $this->assertSame('BRQ123', session('purchase_conversion.transaction_id'));
    }

    public function test_activate_creates_anniversary_subscription_without_day_of_month(): void
    {
        $user = User::factory()->create([
            'pending_subscription_tier' => 'starter',
            'gocardless_billing_request_id' => 'BRQ123',
            'subscription_status' => 'pending',
        ]);

        $billingRequests = Mockery::mock();
        $billingRequests->shouldReceive('get')
            ->once()
            ->with('BRQ123')
            ->andReturn((object) [
                'links' => (object) [
                    'mandate' => 'MD123',
                    'payment_request_payment' => 'PM123',
                ],
            ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('get')
            ->once()
            ->with('PM123')
            ->andReturn((object) [
                'charge_date' => '2026-07-18',
            ]);

        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('create')
            ->once()
            ->with(Mockery::on(function (array $payload): bool {
                $params = $payload['params'] ?? [];
                $headers = $payload['headers'] ?? [];

                return ($params['start_date'] ?? null) === '2026-08-18'
                    && ! array_key_exists('day_of_month', $params)
                    && ($params['interval_unit'] ?? null) === 'monthly'
                    && ($params['links']['mandate'] ?? null) === 'MD123'
                    && ($headers['Idempotency-Key'] ?? null) === 'subscription-BRQ123';
            }))
            ->andReturn((object) ['id' => 'SB999']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('billingRequests')->andReturn($billingRequests);
        $client->shouldReceive('payments')->andReturn($payments);
        $client->shouldReceive('subscriptions')->andReturn($subscriptions);

        $this->serviceWithClient($client)->activateSubscriptionFromBillingRequest($user, 'BRQ123');

        $user->refresh();

        $this->assertSame('starter', $user->subscription_tier);
        $this->assertSame('active', $user->subscription_status);
        $this->assertSame('MD123', $user->gocardless_mandate_id);
        $this->assertSame('SB999', $user->gocardless_subscription_id);
        $this->assertNull($user->pending_subscription_tier);
        $this->assertNull($user->gocardless_billing_request_id);
    }

    public function test_billing_history_lists_payments_by_mandate(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_subscription_id' => 'SB123',
            'gocardless_mandate_id' => 'MD123',
        ]);

        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('get')
            ->once()
            ->with('SB123')
            ->andReturn((object) [
                'currency' => 'GBP',
                'upcoming_payments' => [
                    (object) [
                        'charge_date' => '2026-08-18',
                        'amount' => 700,
                    ],
                ],
            ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('list')
            ->once()
            ->with(Mockery::on(function (array $payload): bool {
                return ($payload['params']['mandate'] ?? null) === 'MD123'
                    && ($payload['params']['limit'] ?? null) === 24;
            }))
            ->andReturn((object) [
                'records' => [
                    (object) [
                        'id' => 'PM_FIRST',
                        'charge_date' => '2026-07-18',
                        'amount' => 700,
                        'currency' => 'GBP',
                        'status' => 'confirmed',
                        'description' => 'AutoCVApply Starter - first month',
                    ],
                ],
            ]);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('subscriptions')->andReturn($subscriptions);
        $client->shouldReceive('payments')->andReturn($payments);

        $history = $this->serviceWithClient($client)->billingHistory($user);

        $this->assertSame('2026-08-18', $history['next_payment_date']);
        $this->assertSame('£7.00', $history['next_payment_amount']);
        $this->assertCount(1, $history['payments']);
        $this->assertSame('PM_FIRST', $history['payments'][0]['id']);
        $this->assertSame('Confirmed', $history['payments'][0]['status_label']);
    }

    public function test_change_paid_plan_updates_subscription_amount_without_direct_debit_payment(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('list')
            ->once()
            ->andReturn((object) ['records' => []]);

        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('update')
            ->once()
            ->with('SB123', Mockery::on(function (array $payload): bool {
                $params = $payload['params'] ?? [];

                return ($params['amount'] ?? null) === 1700
                    && ($params['metadata']['tier'] ?? null) === 'pro';
            }))
            ->andReturn((object) ['id' => 'SB123']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('payments')->andReturn($payments);
        $client->shouldReceive('subscriptions')->andReturn($subscriptions);

        $this->serviceWithClient($client)->changePaidPlan($user, SubscriptionTier::Pro);

        $user->refresh();

        $this->assertSame('pro', $user->subscription_tier);
        $this->assertSame('active', $user->subscription_status);
    }

    public function test_change_paid_plan_downgrade_schedules_tier_and_updates_amount(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('list')
            ->once()
            ->andReturn((object) ['records' => []]);

        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('update')
            ->once()
            ->with('SB123', Mockery::on(function (array $payload): bool {
                return ($payload['params']['amount'] ?? null) === 700;
            }))
            ->andReturn((object) ['id' => 'SB123']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('subscriptions')->andReturn($subscriptions);
        $client->shouldReceive('payments')->andReturn($payments);

        $this->serviceWithClient($client)->changePaidPlan($user, SubscriptionTier::Starter);

        $user->refresh();

        $this->assertSame('pro', $user->subscription_tier);
        $this->assertSame('starter', $user->scheduled_subscription_tier);
    }

    public function test_cancel_subscription_keeps_paid_tier_until_period_end(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('list')
            ->once()
            ->andReturn((object) ['records' => []]);

        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('cancel')
            ->once()
            ->with('SB123')
            ->andReturn((object) ['id' => 'SB123']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('payments')->andReturn($payments);
        $client->shouldReceive('subscriptions')->andReturn($subscriptions);

        $this->serviceWithClient($client)->cancelSubscription($user);

        $user->refresh();

        $this->assertSame('pro', $user->subscription_tier);
        $this->assertSame('free', $user->scheduled_subscription_tier);
        $this->assertNull($user->gocardless_mandate_id);
        $this->assertNull($user->gocardless_subscription_id);
    }

    public function test_create_upgrade_checkout_flow_requests_instant_bank_pay_for_existing_customer(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $mandates = Mockery::mock();
        $mandates->shouldReceive('get')
            ->once()
            ->with('MD123')
            ->andReturn((object) [
                'links' => (object) [
                    'customer' => 'CU123',
                ],
            ]);

        $billingRequests = Mockery::mock();
        $billingRequests->shouldReceive('create')
            ->once()
            ->with(Mockery::on(function (array $payload): bool {
                $params = $payload['params'] ?? [];

                return ($params['payment_request']['scheme'] ?? null) === 'faster_payments'
                    && ($params['payment_request']['amount'] ?? null) === 1000
                    && ($params['payment_request']['description'] ?? null) === 'AutoCVApply upgrade to Pro'
                    && ($params['metadata']['type'] ?? null) === 'plan_upgrade'
                    && ($params['links']['customer'] ?? null) === 'CU123'
                    && ! array_key_exists('mandate_request', $params);
            }))
            ->andReturn((object) ['id' => 'BRQ_UPGRADE']);

        $billingRequestFlows = Mockery::mock();
        $billingRequestFlows->shouldReceive('create')
            ->once()
            ->with(Mockery::on(function (array $payload): bool {
                $params = $payload['params'] ?? [];

                return ($params['links']['billing_request'] ?? null) === 'BRQ_UPGRADE'
                    && ($params['lock_customer_details'] ?? null) === true;
            }))
            ->andReturn((object) ['authorisation_url' => 'https://pay.gocardless.com/flow/upgrade']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('mandates')->andReturn($mandates);
        $client->shouldReceive('billingRequests')->andReturn($billingRequests);
        $client->shouldReceive('billingRequestFlows')->andReturn($billingRequestFlows);

        $url = $this->serviceWithClient($client)->createUpgradeCheckoutFlow(
            $user,
            SubscriptionTier::Pro,
            1000,
        );

        $this->assertSame('https://pay.gocardless.com/flow/upgrade', $url);

        $user->refresh();

        $this->assertSame('pro', $user->pending_subscription_tier);
        $this->assertSame('BRQ_UPGRADE', $user->gocardless_billing_request_id);
        $this->assertSame('starter', $user->subscription_tier);
        $this->assertSame('active', $user->subscription_status);
        $this->assertSame('BRQ_UPGRADE', session('pending_purchase_conversion.transaction_id'));
        $this->assertSame(10.0, session('pending_purchase_conversion.value'));
    }

    public function test_activate_upgrade_billing_request_updates_existing_subscription(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'pending_subscription_tier' => 'pro',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'gocardless_billing_request_id' => 'BRQ_UPGRADE',
        ]);

        $billingRequests = Mockery::mock();
        $billingRequests->shouldReceive('get')
            ->once()
            ->with('BRQ_UPGRADE')
            ->andReturn((object) [
                'metadata' => [
                    'type' => 'plan_upgrade',
                    'tier' => 'pro',
                ],
                'links' => (object) [
                    'payment_request_payment' => 'PM_UPGRADE',
                ],
            ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('list')
            ->once()
            ->andReturn((object) ['records' => []]);

        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('update')
            ->once()
            ->with('SB123', Mockery::on(function (array $payload): bool {
                return ($payload['params']['amount'] ?? null) === 1700;
            }))
            ->andReturn((object) ['id' => 'SB123']);
        $subscriptions->shouldReceive('create')->never();

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('billingRequests')->andReturn($billingRequests);
        $client->shouldReceive('payments')->andReturn($payments);
        $client->shouldReceive('subscriptions')->andReturn($subscriptions);

        $this->serviceWithClient($client)->activateSubscriptionFromBillingRequest($user, 'BRQ_UPGRADE');

        $user->refresh();

        $this->assertSame('pro', $user->subscription_tier);
        $this->assertSame('active', $user->subscription_status);
        $this->assertSame('MD123', $user->gocardless_mandate_id);
        $this->assertSame('SB123', $user->gocardless_subscription_id);
        $this->assertNull($user->pending_subscription_tier);
        $this->assertNull($user->gocardless_billing_request_id);
    }

    public function test_cancel_pending_plan_upgrade_payments(): void
    {
        $user = User::factory()->create([
            'gocardless_mandate_id' => 'MD123',
        ]);

        $payments = Mockery::mock();
        $payments->shouldReceive('list')
            ->once()
            ->andReturn((object) [
                'records' => [
                    (object) [
                        'id' => 'PM_UPGRADE',
                        'status' => 'pending_submission',
                        'metadata' => ['type' => 'plan_upgrade'],
                    ],
                    (object) [
                        'id' => 'PM_OTHER',
                        'status' => 'pending_submission',
                        'metadata' => ['type' => 'other'],
                    ],
                    (object) [
                        'id' => 'PM_SUBMITTED',
                        'status' => 'submitted',
                        'metadata' => ['type' => 'plan_upgrade'],
                    ],
                ],
            ]);
        $payments->shouldReceive('cancel')
            ->once()
            ->with('PM_UPGRADE')
            ->andReturn((object) ['id' => 'PM_UPGRADE']);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('payments')->andReturn($payments);

        $cancelled = $this->serviceWithClient($client)->cancelPendingPlanUpgradePayments($user);

        $this->assertSame(['PM_UPGRADE'], $cancelled);
    }

    private function serviceWithClient(Client $client): GoCardlessService
    {
        $service = new GoCardlessService;
        $reflection = new ReflectionClass($service);
        $property = $reflection->getProperty('client');
        $property->setValue($service, $client);

        return $service;
    }
}
