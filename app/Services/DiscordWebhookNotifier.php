<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class DiscordWebhookNotifier
{
    /**
     * Post an aggregate-safe message to Discord. No-ops when webhook is unset.
     * Never throws: Discord failures are logged and ignored.
     */
    public function notifyNewUser(): bool
    {
        $webhookUrl = config('discord.webhook_url');

        if (! is_string($webhookUrl) || trim($webhookUrl) === '') {
            return false;
        }

        $content = (string) config('discord.new_user_message');

        try {
            $response = Http::timeout(5)
                ->connectTimeout(3)
                ->acceptJson()
                ->asJson()
                ->post($webhookUrl, [
                    'content' => $content,
                ]);

            if ($response->successful()) {
                return true;
            }

            Log::warning('Discord new-user webhook returned a non-success status.', [
                'status' => $response->status(),
            ]);
        } catch (Throwable $e) {
            Log::warning('Discord new-user webhook failed.', [
                'error' => $e->getMessage(),
            ]);
        }

        return false;
    }
}
