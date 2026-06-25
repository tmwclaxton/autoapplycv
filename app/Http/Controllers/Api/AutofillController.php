<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AiTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AutofillController extends Controller
{
    public function __construct(
        private readonly AiTokenService $usage,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $this->usage->canAutofill($user)) {
            return response()->json([
                'success' => false,
                'error' => 'You have used all of your extension autofills for this month.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $this->usage->recordAutofill($user);

        return response()->json([
            'success' => true,
            'subscription' => $this->usage->summary($user),
        ]);
    }
}
