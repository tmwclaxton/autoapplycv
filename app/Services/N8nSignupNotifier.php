<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class N8nSignupNotifier
{
    /**
     * POST signup details to n8n. No-ops when N8N_TOKEN is unset.
     * Never throws: failures are logged and ignored.
     */
    public function notifyNewUser(User $user): bool
    {
        $token = config('n8n.token');

        if (! is_string($token) || trim($token) === '') {
            return false;
        }

        $email = trim((string) $user->email);

        if ($email === '') {
            Log::warning('n8n signup webhook skipped: user email is empty.');

            return false;
        }

        $payload = ['email' => $email];
        $firstName = $this->firstNameFromUser($user);

        if ($firstName !== null) {
            $payload['firstName'] = $firstName;
        }

        $url = (string) config('n8n.signup_webhook_url');

        try {
            $response = Http::timeout(5)
                ->connectTimeout(3)
                ->acceptJson()
                ->asJson()
                ->withToken(trim($token))
                ->post($url, $payload);

            if ($response->successful()) {
                return true;
            }

            Log::warning('n8n signup webhook returned a non-success status.', [
                'status' => $response->status(),
            ]);
        } catch (Throwable $e) {
            Log::warning('n8n signup webhook failed.', [
                'error' => $e->getMessage(),
            ]);
        }

        return false;
    }

    /**
     * firstName is optional: only when the user name yields a non-empty first token.
     */
    private function firstNameFromUser(User $user): ?string
    {
        $name = trim((string) ($user->name ?? ''));

        if ($name === '') {
            return null;
        }

        $firstName = trim(explode(' ', $name, 2)[0]);

        return $firstName !== '' ? $firstName : null;
    }
}
