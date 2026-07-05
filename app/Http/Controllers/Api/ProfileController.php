<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProfileDocumentCategory;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateExtensionProfileRequest;
use App\Models\CvProfile;
use App\Models\User;
use App\Services\AiTokenService;
use App\Services\CvProfileDocumentService;
use App\Support\ApplicationSettings;
use App\Support\CvExtractionSchema;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(
        private readonly AiTokenService $aiTokens,
        private readonly CvProfileDocumentService $cvDocuments,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'No profile found'], 404);
        }

        $this->cvDocuments->backfillFromCvUploads($user->id);

        return response()->json($this->profilePayload($user, $profile));
    }

    public function update(UpdateExtensionProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();
        $structuredPatch = $validated['structured_data'] ?? [];
        $applicationSettingsPatch = $validated['application_settings'] ?? [];
        unset($validated['structured_data'], $validated['application_settings']);

        $profile = CvProfile::updateOrCreate(
            ['user_id' => $user->id],
            array_merge($validated, ['parsing_complete' => true]),
        );

        if ($structuredPatch !== []) {
            $profile->structured_data = array_merge(
                CvExtractionSchema::emptyStructuredData(),
                is_array($profile->structured_data) ? $profile->structured_data : [],
                $structuredPatch,
            );
        }

        if ($applicationSettingsPatch !== []) {
            unset($applicationSettingsPatch['earliest_start']);

            $profile->application_settings = ApplicationSettings::merge(
                array_merge(is_array($profile->application_settings) ? $profile->application_settings : [], $applicationSettingsPatch),
            );
        }

        if ($structuredPatch !== [] || $applicationSettingsPatch !== []) {
            $profile->save();
        }

        $profile->refresh();

        $applicationSettings = ApplicationSettings::merge($profile->application_settings);

        return response()->json([
            'success' => true,
            'computed_earliest_start' => ApplicationSettings::computeEarliestStart($applicationSettings['notice_period']),
            'profile' => [
                'full_name' => $profile->full_name,
                'headline' => $profile->headline,
                'email' => $profile->email,
                'phone' => $profile->phone,
                'location' => $profile->location,
                'city' => $profile->city,
                'postcode' => $profile->postcode,
                'country' => $profile->country,
                'linkedin_url' => $profile->linkedin_url,
                'website_url' => $profile->website_url,
                'summary' => $profile->summary,
                'skills' => $profile->skills ?? [],
                'experience' => $profile->experience ?? [],
                'education' => $profile->education ?? [],
                'extra_context' => $profile->extra_context,
                'formatted_cv_text' => $profile->formatted_cv_text,
                'structured_data' => $profile->structured_data ?? [],
                'application_settings' => $applicationSettings,
            ],
            'subscription' => $this->aiTokens->summary($user),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function profilePayload(User $user, CvProfile $profile): array
    {
        $applicationSettings = ApplicationSettings::merge($profile->application_settings);

        return [
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
            ],
            'profile' => [
                'full_name' => $profile->full_name ?? $user->name,
                'headline' => $profile->headline,
                'email' => $profile->email ?? $user->email,
                'phone' => $profile->phone,
                'location' => $profile->location,
                'city' => $profile->city,
                'postcode' => $profile->postcode,
                'country' => $profile->country,
                'linkedin_url' => $profile->linkedin_url,
                'website_url' => $profile->website_url,
                'summary' => $profile->summary,
                'skills' => $profile->skills ?? [],
                'experience' => $profile->experience ?? [],
                'education' => $profile->education ?? [],
                'structured_data' => $profile->structured_data ?? [],
                'formatted_cv_text' => $profile->formatted_cv_text,
                'extra_context' => $profile->extra_context,
            ],
            'documents' => $user->profileDocuments()
                ->latest()
                ->get()
                ->map(fn ($document) => $document->toFrontendArray('api.profile.documents.download'))
                ->values()
                ->all(),
            'document_categories' => ProfileDocumentCategory::options(),
            'application_settings' => $applicationSettings,
            'computed_earliest_start' => ApplicationSettings::computeEarliestStart($applicationSettings['notice_period']),
            'subscription' => $this->aiTokens->summary($user),
        ];
    }
}
