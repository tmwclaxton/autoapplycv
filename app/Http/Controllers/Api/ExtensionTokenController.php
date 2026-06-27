<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExtensionConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExtensionTokenController extends Controller
{
    public function __construct(
        private readonly ExtensionConnectionService $connections,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $connection = $this->connections->mintFor($request->user());

        return response()->json([
            'connection_json' => json_encode($connection, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
        ]);
    }

    public function destroy(Request $request, int $token): JsonResponse
    {
        $request->user()->tokens()->where('id', $token)->delete();

        return response()->json(['success' => true]);
    }
}
