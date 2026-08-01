<?php

namespace App\Listeners;

use App\Models\User;
use App\Services\N8nSignupNotifier;
use Illuminate\Auth\Events\Registered;
use Illuminate\Contracts\Queue\ShouldQueue;

class SendNewUserN8nNotification implements ShouldQueue
{
    public function __construct(public N8nSignupNotifier $n8n) {}

    /**
     * Handle the event.
     */
    public function handle(Registered $event): void
    {
        $user = $event->user;

        if (! $user instanceof User) {
            return;
        }

        $this->n8n->notifyNewUser($user);
    }
}
