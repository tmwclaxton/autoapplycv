<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreJobApplicationRequest;
use App\Http\Requests\UpdateJobApplicationRequest;
use App\Models\JobApplication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobApplicationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $applications = $request->user()
            ->jobApplications()
            ->latest('applied_at')
            ->limit(200)
            ->get()
            ->map(fn (JobApplication $application): array => $application->toFrontendArray())
            ->values()
            ->all();

        return response()->json([
            'success' => true,
            'applications' => $applications,
        ]);
    }

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
                'job_description' => $validated['job_description'] ?? null,
                'source' => $validated['source'] ?? 'linkedin',
                'applied_at' => $validated['applied_at'] ?? now(),
            ],
        );

        return response()->json([
            'success' => true,
            'application' => $application->fresh()->toFrontendArray(),
        ], $application->wasRecentlyCreated ? 201 : 200);
    }

    public function update(UpdateJobApplicationRequest $request, JobApplication $jobApplication): JsonResponse
    {
        $jobApplication->fill($request->validated());
        $jobApplication->save();

        return response()->json([
            'success' => true,
            'application' => $jobApplication->fresh()->toFrontendArray(),
        ]);
    }
}
