<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SendNewUserN8nNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registered_event_posts_email_and_first_name(): void
    {
        $webhookUrl = 'https://tmwclaxton.app.n8n.cloud/webhook/autocvapply-signup';
        $token = 'test-n8n-token';

        config([
            'discord.webhook_url' => null,
            'n8n.signup_webhook_url' => $webhookUrl,
            'n8n.token' => $token,
        ]);

        Http::preventStrayRequests();
        Http::fake([
            $webhookUrl => Http::response(['ok' => true], 200),
        ]);

        $user = User::factory()->create([
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
        ]);

        event(new Registered($user));

        Http::assertSent(function (Request $request) use ($webhookUrl, $token): bool {
            return $request->url() === $webhookUrl
                && $request->method() === 'POST'
                && $request->hasHeader('Authorization', 'Bearer '.$token)
                && $request['email'] === 'jane@example.com'
                && $request['firstName'] === 'Jane'
                && count($request->data()) === 2;
        });
    }

    public function test_registered_event_omits_first_name_when_name_empty(): void
    {
        $webhookUrl = 'https://tmwclaxton.app.n8n.cloud/webhook/autocvapply-signup';

        config([
            'discord.webhook_url' => null,
            'n8n.signup_webhook_url' => $webhookUrl,
            'n8n.token' => 'test-n8n-token',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            $webhookUrl => Http::response(['ok' => true], 200),
        ]);

        $user = User::factory()->create([
            'name' => '   ',
            'email' => 'noname@example.com',
        ]);

        event(new Registered($user));

        Http::assertSent(function (Request $request): bool {
            $data = $request->data();

            return $request['email'] === 'noname@example.com'
                && ! array_key_exists('firstName', $data)
                && count($data) === 1;
        });
    }

    public function test_n8n_errors_fail_soft_without_throwing(): void
    {
        $webhookUrl = 'https://tmwclaxton.app.n8n.cloud/webhook/autocvapply-signup';

        config([
            'discord.webhook_url' => null,
            'n8n.signup_webhook_url' => $webhookUrl,
            'n8n.token' => 'test-n8n-token',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            $webhookUrl => Http::response(['message' => 'Unauthorized'], 401),
        ]);

        event(new Registered(User::factory()->create([
            'email' => 'softfail@example.com',
        ])));

        Http::assertSentCount(1);
    }

    public function test_missing_token_is_a_noop(): void
    {
        config([
            'discord.webhook_url' => null,
            'n8n.token' => null,
        ]);

        Http::preventStrayRequests();
        Http::fake();

        event(new Registered(User::factory()->create()));

        Http::assertNothingSent();
    }
}
