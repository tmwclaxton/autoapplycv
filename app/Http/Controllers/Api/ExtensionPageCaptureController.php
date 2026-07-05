<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExtensionPageCaptureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ExtensionPageCaptureController extends Controller
{
    public function __construct(
        private readonly ExtensionPageCaptureService $captures,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $maxBytes = (int) config('admin.page_capture_max_bytes', 5_000_000);

        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
            'page_title' => ['nullable', 'string', 'max:512'],
            'html' => ['required', 'string', "max:{$maxBytes}"],
        ]);

        $html = (string) $validated['html'];

        if (strlen($html) > $maxBytes) {
            throw ValidationException::withMessages([
                'html' => 'Page HTML exceeds the maximum allowed size.',
            ]);
        }

        $capture = $this->captures->store(
            user: $request->user(),
            url: (string) $validated['url'],
            pageTitle: (string) ($validated['page_title'] ?? ''),
            html: $html,
        );

        return response()->json([
            'success' => true,
            'capture_id' => $capture->id,
        ], 201);
    }
}
