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

    private function serviceWithClient(Client $client): GoCardlessService
    {
        $service = new GoCardlessService;
        $reflection = new ReflectionClass($service);
        $property = $reflection->getProperty('client');
        $property->setValue($service, $client);

        return $service;
    }
}
