<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AwardUserCreditsRequest;
use App\Models\User;
use App\Services\AdminCreditAwardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class AdminUserCreditController extends Controller
{
    public function __construct(
        private readonly AdminCreditAwardService $credits,
    ) {}

    public function lookup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        $user = User::query()
            ->where('email', $validated['email'])
            ->first();

        if ($user === null) {
            return response()->json([
                'message' => 'No user found with that email.',
            ], 404);
        }

        return response()->json([
            'user' => $this->credits->userCreditSummary($user),
        ]);
    }

    public function store(AwardUserCreditsRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $recipient = User::query()
            ->where('email', $validated['email'])
            ->firstOrFail();

        $grant = $this->credits->award(
            $recipient,
            $request->user(),
            (int) $validated['amount'],
            $validated['note'] ?? null,
        );

        return redirect()
            ->route('admin.dashboard', ['tab' => 'users'])
            ->with('credit_award_success', sprintf(
                'Awarded %s autofills to %s.',
                number_format($grant->amount),
                $recipient->email,
            ));
    }
}
