<?php

namespace App\Http\Controllers;

use App\Exceptions\NanoGptRequestException;
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
use App\Services\ExtensionNanoGptUsageService;
use App\Support\ApplicationAnswers;
use App\Support\ApplicationSettings;
use App\Support\CoverLetterDesignSettings;
use App\Support\CvExtractionProfileMerge;
use App\Support\CvExtractionSchema;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CvUploadController extends Controller
{
    public function __construct(
        private readonly CvParserService $cvParser,
        private readonly CvExtractionService $cvExtraction,
        private readonly AiTokenService $aiTokens,
        private readonly CvProfileDocumentService $cvDocuments,
        private readonly AutofillAnalyticsService $analytics,
        private readonly ExtensionNanoGptUsageService $nanoGptUsage,
    ) {}

    public function store(StoreCvUploadRequest $request): JsonResponse
    {
        set_time_limit((int) config('cv.upload_time_limit', 300));

        $file = $request->file('cv');
        $user = $request->user();

        $this->cvDocuments->clearExistingCvArtifacts($user);

        $startedAt = microtime(true);

        // Persist first so text/OCR and link extract use a stable on-disk path.
        $originalFilename = $file->getClientOriginalName();
        $mimeType = $file->getMimeType();
        $fileSize = (int) $file->getSize();
        $contentHash = hash_file('sha256', $file->getRealPath() ?: '') ?: null;
        $storedPath = $file->store("cv-uploads/{$user->id}", 'local');
        $absolutePath = Storage::disk('local')->path($storedPath);
        $storeSeconds = round(microtime(true) - $startedAt, 3);

        CvUpload::create([
            'user_id' => $user->id,
            'original_filename' => $originalFilename,
            'stored_path' => $storedPath,
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
        ]);

        $this->cvDocuments->recordCvUpload(
            $user,
            $storedPath,
            $originalFilename,
            $mimeType,
            $fileSize,
        );

        // Sequential on purpose: process-driver Concurrency corrupts UploadedFile payloads,
        // and hyperlink extract is typically <100ms so parallel spawn costs more than it saves.
        $extractStartedAt = microtime(true);
        $uploadedForParse = new UploadedFile($absolutePath, $originalFilename, $mimeType, null, true);
        $extracted = $this->cvParser->extractTextWithMetadata($uploadedForParse);
        $textSeconds = round(microtime(true) - $extractStartedAt, 3);

        $linksStartedAt = microtime(true);
        $extractedUrls = $this->cvParser->extractHyperlinks(
            new UploadedFile($absolutePath, $originalFilename, $mimeType, null, true),
        );
        $linkSeconds = round(microtime(true) - $linksStartedAt, 3);

        $rawText = CvExtractionSchema::appendHyperlinksToRawText($extracted['text'], $extractedUrls);

        $parseWarning = null;
        $aiStartedAt = microtime(true);

        try {
            $parsed = $this->parseWithAi(
                $user,
                $rawText,
                $originalFilename,
                $extractedUrls,
                $request,
                $extracted['ocr_used'],
                $contentHash,
            );
        } catch (NanoGptRequestException $exception) {
            Log::warning('CV upload AI parsing unavailable', [
                'user_id' => $user->id,
                'code' => $exception->errorCode,
                'status' => $exception->statusCode,
                'provider_status' => $exception->providerStatus,
                'message' => $exception->getMessage(),
            ]);

            $parsed = null;
            $parseWarning = $exception->getMessage().' Your CV file and raw text were saved - try uploading again in a moment or edit the profile manually.';
        }

        $aiSeconds = round(microtime(true) - $aiStartedAt, 3);
        $persistStartedAt = microtime(true);

        $existingProfile = CvProfile::query()->where('user_id', $user->id)->first();

        $profile = CvProfile::updateOrCreate(
            ['user_id' => $user->id],
            CvExtractionProfileMerge::apply($existingProfile, $parsed, $rawText, $parsed !== null),
        );

        if ($parsed !== null) {
            $this->analytics->recordCvParsed();
        }

        $persistSeconds = round(microtime(true) - $persistStartedAt, 3);
        $totalSeconds = round(microtime(true) - $startedAt, 3);

        Log::info('CV upload parse timings', [
            'user_id' => $user->id,
            'filename' => $originalFilename,
            'ocr_used' => $extracted['ocr_used'],
            'raw_text_length' => mb_strlen($rawText),
            'store_s' => $storeSeconds,
            'text_extract_s' => $textSeconds,
            'hyperlinks_s' => $linkSeconds,
            'ai_extract_s' => $aiSeconds,
            'persist_s' => $persistSeconds,
            'total_s' => $totalSeconds,
            'ai_ok' => $parsed !== null,
        ]);

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
            $response['warning'] = $parseWarning
                ?? 'We saved your CV but AI parsing timed out or failed. Your raw text is stored - try uploading again in a moment or edit the profile manually.';
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
            ...ApplicationAnswers::validationRules(),
            ...CoverLetterDesignSettings::validationRules(),
        ]);

        if (array_key_exists('application_settings', $validated)) {
            $validated['application_settings'] = ApplicationSettings::merge($validated['application_settings']);
        }

        if (array_key_exists('application_answers', $validated)) {
            $validated['application_answers'] = ApplicationAnswers::normalize($validated['application_answers']);
        }

        unset($validated['application_answers_append'], $validated['application_answers_remove_id']);

        $existing = CvProfile::query()->where('user_id', $request->user()->id)->first();

        if (array_key_exists('cover_letter_design', $validated) || array_key_exists('cover_letter_font', $validated)) {
            $normalized = CoverLetterDesignSettings::normalize(
                $validated['cover_letter_design'] ?? $existing?->cover_letter_design,
                $validated['cover_letter_font'] ?? $existing?->cover_letter_font,
            );
            $validated['cover_letter_design'] = $normalized['cover_letter_design'];
            $validated['cover_letter_font'] = $normalized['cover_letter_font'];
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

        return redirect()->route('dashboard', ['tab' => 'extension'])->with('success', 'Profile saved.');
    }

    private function documentDownloadRoute(Request $request): string
    {
        return $request->is('api/*')
            ? 'api.profile.documents.download'
            : 'profile.documents.download';
    }

    /**
     * @param  array<int, string>  $extractedUrls
     * @return array<string, mixed>|null
     */
    private function parseWithAi(
        User $user,
        string $rawText,
        string $filename,
        array $extractedUrls = [],
        ?Request $request = null,
        bool $ocrUsed = false,
        ?string $contentHash = null,
    ): ?array {
        $extracted = $this->cvExtraction->extractWithUsage(
            $rawText,
            $filename,
            $extractedUrls,
            $ocrUsed,
            $contentHash,
        );

        if ($request?->is('api/*') && $extracted['usage'] !== null) {
            $this->nanoGptUsage->record($user, 'cv.upload', $extracted['usage']);
        }

        return $extracted['data'];
    }
}
