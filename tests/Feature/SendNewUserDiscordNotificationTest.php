<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SendNewUserDiscordNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registered_event_posts_aggregate_safe_discord_message(): void
    {
        $webhookUrl = 'https://discord.com/api/webhooks/test/token';

        config([
            'discord.webhook_url' => $webhookUrl,
            'discord.new_user_message' => 'New user joined AutoCVApply',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            $webhookUrl => Http::response('', 204),
        ]);

        $user = User::factory()->create([
            'name' => 'Secret Person',
            'email' => 'secret.person@example.com',
            'workos_id' => 'workos_secret_123',
        ]);

        event(new Registered($user));

        Http::assertSent(function (Request $request) use ($webhookUrl, $user): bool {
            $body = $request->body();

            return $request->url() === $webhookUrl
                && $request['content'] === 'New user joined AutoCVApply'
                && ! str_contains($body, (string) $user->email)
                && ! str_contains($body, (string) $user->name)
                && ! str_contains($body, (string) $user->workos_id);
        });
    }

    public function test_discord_errors_fail_soft_without_throwing(): void
    {
        $webhookUrl = 'https://discord.com/api/webhooks/test/token';

        config([
            'discord.webhook_url' => $webhookUrl,
            'discord.new_user_message' => 'New user joined AutoCVApply',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            $webhookUrl => Http::response(['message' => 'Invalid Webhook Token'], 401),
        ]);

        $user = User::factory()->create([
            'name' => 'Secret Person',
            'email' => 'secret.person@example.com',
        ]);

        event(new Registered($user));

        Http::assertSentCount(1);
    }

    public function test_missing_webhook_url_is_a_noop(): void
    {
        config([
            'discord.webhook_url' => null,
        ]);

        Http::preventStrayRequests();
        Http::fake();

        event(new Registered(User::factory()->create()));

        Http::assertNothingSent();
    }
}
