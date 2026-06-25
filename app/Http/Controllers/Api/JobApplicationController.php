<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreJobApplicationRequest;
use App\Models\JobApplication;
use Illuminate\Http\JsonResponse;

class JobApplicationController extends Controller
{
    public function store(StoreJobApplicationRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $application = JobApplication::query()->updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'link' => $validated['link'],
            ],
            [
                'title' => $validated['title'],
                'company' => $validated['company'],
                'location' => $validated['location'] ?? null,
                'source' => $validated['source'] ?? 'linkedin',
                'applied_at' => $validated['applied_at'] ?? now(),
            ],
        );

        return response()->json([
            'success' => true,
            'application' => $application->toFrontendArray(),
        ], $application->wasRecentlyCreated ? 201 : 200);
    }
}
