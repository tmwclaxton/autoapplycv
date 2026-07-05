<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCvUploadRequest;
use App\Models\CvProfile;
use App\Models\CvUpload;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\AiTokenService;
use App\Services\AutofillAnalyticsService;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use App\Services\CvProfileDocumentService;
use App\Support\ApplicationSettings;
use App\Support\CvExtractionProfileMerge;
use App\Support\CvExtractionSchema;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CvUploadController extends Controller
{
    public function __construct(
        private readonly CvParserService $cvParser,
        private readonly CvExtractionService $cvExtraction,
        private readonly AiTokenService $aiTokens,
        private readonly CvProfileDocumentService $cvDocuments,
        private readonly AutofillAnalyticsService $analytics,
    ) {}

    public function store(StoreCvUploadRequest $request): JsonResponse
    {
        set_time_limit((int) config('cv.upload_time_limit', 300));

        $file = $request->file('cv');
        $user = $request->user();

        $this->cvDocuments->clearExistingCvArtifacts($user);

        $rawText = $this->cvParser->extractText($file);
        $extractedUrls = $this->cvParser->extractHyperlinks($file);
        $rawText = CvExtractionSchema::appendHyperlinksToRawText($rawText, $extractedUrls);

        $storedPath = $file->store("cv-uploads/{$user->id}", 'local');

        CvUpload::create([
            'user_id' => $user->id,
            'original_filename' => $file->getClientOriginalName(),
            'stored_path' => $storedPath,
            'mime_type' => $file->getMimeType(),
            'file_size' => $file->getSize(),
        ]);

        $this->cvDocuments->recordCvUpload(
            $user,
            $storedPath,
            $file->getClientOriginalName(),
            $file->getMimeType(),
            (int) $file->getSize(),
        );

        $parsed = $this->parseWithAi($user, $rawText, $file->getClientOriginalName(), $extractedUrls);

        $existingProfile = CvProfile::query()->where('user_id', $user->id)->first();

        $profile = CvProfile::updateOrCreate(
            ['user_id' => $user->id],
            CvExtractionProfileMerge::apply($existingProfile, $parsed, $rawText, $parsed !== null),
        );

        if ($parsed !== null) {
            $this->analytics->recordCvParsed();
        }

        $response = [
            'success' => true,
            'profile' => $profile,
            'subscription' => $this->aiTokens->summary($user),
            'documents' => $user->profileDocuments()
                ->latest()
                ->get()
                ->map(fn (ProfileDocument $document): array => $document->toFrontendArray($this->documentDownloadRoute($request)))
                ->values()
                ->all(),
        ];

        if ($parsed === null && $rawText !== '') {
            $response['warning'] = 'We saved your CV but AI parsing timed out or failed. Your raw text is stored - try uploading again in a moment or edit the profile manually.';
        }

        return response()->json($response);
    }

    public function updateProfile(Request $request): JsonResponse|RedirectResponse
    {
        $validated = $request->validate([
            'full_name' => 'nullable|string|max:255',
            'headline' => 'nullable|string',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'location' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:255',
            'postcode' => 'nullable|string|max:32',
            'country' => 'nullable|string|max:255',
            'linkedin_url' => 'nullable|url|max:500',
            'website_url' => 'nullable|url|max:500',
            'summary' => 'nullable|string',
            'skills' => 'nullable|array',
            'experience' => 'nullable|array',
            'education' => 'nullable|array',
            'structured_data' => 'nullable|array',
            'formatted_cv_text' => 'nullable|string',
            'extra_context' => 'nullable|string',
            ...ApplicationSettings::validationRules(),
        ]);

        if (array_key_exists('application_settings', $validated)) {
            $validated['application_settings'] = ApplicationSettings::merge($validated['application_settings']);
        }

        $profile = CvProfile::updateOrCreate(
            ['user_id' => $request->user()->id],
            array_merge($validated, ['parsing_complete' => true])
        );

        if ($request->wantsJson()) {
            return response()->json([
                'success' => true,
                'profile' => $profile,
            ]);
        }

        return redirect()->route('dashboard')->with('success', 'Profile saved.');
    }

    private function documentDownloadRoute(Request $request): string
    {
        return $request->is('api/*')
            ? 'api.profile.documents.download'
            : 'profile.documents.download';
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseWithAi(User $user, string $rawText, string $filename, array $extractedUrls = []): ?array
    {
        unset($user);

        return $this->cvExtraction->extract($rawText, $filename, $extractedUrls);
    }
}
