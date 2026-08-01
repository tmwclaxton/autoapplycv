<?php

namespace App\Listeners;

use App\Services\DiscordWebhookNotifier;
use Illuminate\Auth\Events\Registered;
use Illuminate\Contracts\Queue\ShouldQueue;

class SendNewUserDiscordNotification implements ShouldQueue
{
    public function __construct(public DiscordWebhookNotifier $discord) {}

    /**
     * Handle the event.
     *
     * Intentionally ignores user attributes so Discord never receives PII.
     */
    public function handle(Registered $event): void
    {
        $this->discord->notifyNewUser();
    }
}
