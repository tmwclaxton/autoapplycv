<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProfileDocumentCategory;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateExtensionProfileRequest;
use App\Models\CvProfile;
use App\Models\User;
use App\Services\AiTokenService;
use App\Services\CvProfileDocumentService;
use App\Support\AiAssistCosts;
use App\Support\ApplicationAnswers;
use App\Support\ApplicationSettings;
use App\Support\CoverLetterDesignSettings;
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
        $applicationAnswers = $validated['application_answers'] ?? null;
        $applicationAnswersAppend = $validated['application_answers_append'] ?? null;
        $applicationAnswersRemoveId = $validated['application_answers_remove_id'] ?? null;
        $coverLetterDesign = array_key_exists('cover_letter_design', $validated) ? $validated['cover_letter_design'] : null;
        $coverLetterFont = array_key_exists('cover_letter_font', $validated) ? $validated['cover_letter_font'] : null;
        unset(
            $validated['structured_data'],
            $validated['application_settings'],
            $validated['application_answers'],
            $validated['application_answers_append'],
            $validated['application_answers_remove_id'],
            $validated['cover_letter_design'],
            $validated['cover_letter_font'],
        );

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

        $answersChanged = false;

        if ($applicationAnswers !== null) {
            $profile->application_answers = ApplicationAnswers::normalize($applicationAnswers);
            $answersChanged = true;
        }

        if (is_array($applicationAnswersAppend)) {
            $profile->application_answers = ApplicationAnswers::upsert(
                ApplicationAnswers::normalize($profile->application_answers),
                (string) ($applicationAnswersAppend['question'] ?? ''),
                (string) ($applicationAnswersAppend['answer'] ?? ''),
            );
            $answersChanged = true;
        }

        if (is_string($applicationAnswersRemoveId) && $applicationAnswersRemoveId !== '') {
            $profile->application_answers = ApplicationAnswers::removeById(
                ApplicationAnswers::normalize($profile->application_answers),
                $applicationAnswersRemoveId,
            );
            $answersChanged = true;
        }

        if ($coverLetterDesign !== null || $coverLetterFont !== null) {
            $normalized = CoverLetterDesignSettings::normalize(
                $coverLetterDesign ?? $profile->cover_letter_design,
                $coverLetterFont ?? $profile->cover_letter_font,
            );
            $profile->cover_letter_design = $normalized['cover_letter_design'];
            $profile->cover_letter_font = $normalized['cover_letter_font'];
        }

        if ($structuredPatch !== [] || $applicationSettingsPatch !== [] || $answersChanged || $coverLetterDesign !== null || $coverLetterFont !== null) {
            $profile->save();
        }

        $profile->refresh();

        $applicationSettings = ApplicationSettings::merge($profile->application_settings);
        $coverLetterSettings = CoverLetterDesignSettings::normalize($profile->cover_letter_design, $profile->cover_letter_font);

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
                'application_answers' => ApplicationAnswers::normalize($profile->application_answers),
                'cover_letter_design' => $coverLetterSettings['cover_letter_design'],
                'cover_letter_font' => $coverLetterSettings['cover_letter_font'],
            ],
            'subscription' => $this->aiTokens->summary($user),
            'ai_assist' => AiAssistCosts::forFrontend(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function profilePayload(User $user, CvProfile $profile): array
    {
        $applicationSettings = ApplicationSettings::merge($profile->application_settings);
        $coverLetterSettings = CoverLetterDesignSettings::normalize($profile->cover_letter_design, $profile->cover_letter_font);

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
                'application_answers' => ApplicationAnswers::normalize($profile->application_answers),
                'cover_letter_design' => $coverLetterSettings['cover_letter_design'],
                'cover_letter_font' => $coverLetterSettings['cover_letter_font'],
            ],
            'documents' => $user->profileDocuments()
                ->latest()
                ->get()
                ->map(fn ($document) => $document->toFrontendArray('api.profile.documents.download'))
                ->values()
                ->all(),
            'document_categories' => ProfileDocumentCategory::uploadOptions(),
            'application_settings' => $applicationSettings,
            'cover_letter_design' => $coverLetterSettings['cover_letter_design'],
            'cover_letter_font' => $coverLetterSettings['cover_letter_font'],
            'computed_earliest_start' => ApplicationSettings::computeEarliestStart($applicationSettings['notice_period']),
            'subscription' => $this->aiTokens->summary($user),
            'ai_assist' => AiAssistCosts::forFrontend(),
        ];
    }
}
