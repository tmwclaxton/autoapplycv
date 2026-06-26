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
        $validated = $request->validate([
            'count' => ['required', 'integer', 'min:1', 'max:100'],
        ]);

        $user = $request->user();
        $count = (int) $validated['count'];

        if (! $this->usage->canAutofill($user, $count)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for this month.',
                'subscription' => $this->usage->summary($user),
                'extension_usage' => $this->usage->extensionUsageSummary($user),
            ], 402);
        }

        $this->usage->recordAutofill($user, $count);
        $this->usage->recordFieldsAutofilled($user, $count);

        return response()->json([
            'success' => true,
            'count' => $count,
            'subscription' => $this->usage->summary($user),
            'extension_usage' => $this->usage->extensionUsageSummary($user),
        ]);
    }
}
