<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExtensionTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $user->tokens()->where('name', 'extension')->delete();

        $token = $user->createToken('extension', ['profile:read']);

        return response()->json([
            'token' => $token->plainTextToken,
            'api_base' => rtrim((string) config('app.url'), '/'),
        ]);
    }

    public function destroy(Request $request, int $token): JsonResponse
    {
        $request->user()->tokens()->where('id', $token)->delete();

        return response()->json(['success' => true]);
    }
}
