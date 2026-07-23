<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CaptchaSolverService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class ExtensionCaptchaController extends Controller
{
    public function __construct(
        private readonly CaptchaSolverService $solver,
    ) {}

    public function solve(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:recaptcha_v2'],
            'sitekey' => ['required', 'string', 'max:256'],
            'page_url' => ['required', 'url', 'max:2048'],
        ]);

        try {
            $result = $this->solver->solveRecaptchaV2(
                sitekey: (string) $validated['sitekey'],
                pageUrl: (string) $validated['page_url'],
            );
        } catch (RuntimeException $exception) {
            return response()->json([
                'success' => false,
                'error' => $exception->getMessage(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'token' => $result['token'],
            'provider' => $result['provider'],
        ]);
    }
}
