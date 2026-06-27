<?php

namespace App\Services;

use App\Models\User;

class ExtensionConnectionService
{
    /**
     * @return array{token: string, api_base: string}
     */
    public function mintFor(User $user): array
    {
        $user->tokens()->where('name', 'extension')->delete();

        $token = $user->createToken('extension', ['profile:read']);

        return [
            'token' => $token->plainTextToken,
            'api_base' => rtrim((string) config('app.url'), '/'),
        ];
    }
}
