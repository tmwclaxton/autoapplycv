<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateJobApplicationRequest;
use App\Models\JobApplication;
use Illuminate\Http\JsonResponse;

class JobApplicationController extends Controller
{
    public function update(UpdateJobApplicationRequest $request, JobApplication $jobApplication): JsonResponse
    {
        $jobApplication->fill($request->validated());
        $jobApplication->save();

        return response()->json([
            'success' => true,
            'application' => $jobApplication->fresh()->toFrontendArray(includeArtifacts: true),
        ]);
    }
}
