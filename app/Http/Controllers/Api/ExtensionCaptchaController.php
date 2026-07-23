<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CaptchaSolverService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

class ExtensionCaptchaController extends Controller
{
    public function __construct(
        private readonly CaptchaSolverService $solver,
    ) {}

    public function solve(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:recaptcha_v2,hcaptcha,turnstile'],
            'sitekey' => ['required', 'string', 'max:256'],
            'page_url' => ['required', 'url', 'max:2048'],
        ]);

        try {
            $result = $this->solver->solve(
                type: (string) $validated['type'],
                sitekey: (string) $validated['sitekey'],
                pageUrl: (string) $validated['page_url'],
            );
        } catch (InvalidArgumentException|RuntimeException $exception) {
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
