<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCoverLetterDocumentRequest;
use App\Services\CoverLetterDocumentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CoverLetterDocumentController extends Controller
{
    public function __construct(
        private readonly CoverLetterDocumentService $coverLetters,
    ) {}

    public function store(StoreCoverLetterDocumentRequest $request): JsonResponse
    {
        $user = $request->user();
        $job = $this->normalizeJob($request->validated('job'));
        $fileBase64 = trim((string) $request->input('file_base64', ''));

        if ($fileBase64 !== '') {
            $decoded = base64_decode($this->stripDataUrlPrefix($fileBase64), true);

            if ($decoded === false || $decoded === '') {
                return response()->json([
                    'message' => 'Cover letter file could not be decoded.',
                ], 422);
            }

            $result = $this->coverLetters->savePdfBytes(
                $user,
                $job,
                $decoded,
                (string) ($request->input('file_name') ?: $this->coverLetters->buildFileName($job)),
            );
        } else {
            $result = $this->coverLetters->saveFromText(
                $user,
                $job,
                trim((string) $request->input('text')),
            );
        }

        if (! $result['saved'] && ! $result['duplicate'] && $result['document'] === null) {
            $maxDocuments = (int) config('cv.max_profile_documents', 25);

            return response()->json([
                'message' => "You can store up to {$maxDocuments} documents. Delete one to save another cover letter.",
            ], 422);
        }

        $downloadRoute = $this->documentDownloadRoute($request);

        return response()->json([
            'success' => true,
            'saved' => $result['saved'],
            'duplicate' => $result['duplicate'],
            'document' => $result['document']?->toFrontendArray($downloadRoute),
        ], $result['saved'] ? 201 : 200);
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array<string, mixed>
     */
    private function normalizeJob(array $job): array
    {
        return [
            'title' => isset($job['title']) ? trim((string) $job['title']) : null,
            'company' => isset($job['company']) ? trim((string) $job['company']) : null,
            'link' => isset($job['link']) ? trim((string) $job['link']) : null,
        ];
    }

    private function stripDataUrlPrefix(string $value): string
    {
        if (! str_contains($value, ',')) {
            return $value;
        }

        return (string) substr($value, (int) strrpos($value, ',') + 1);
    }

    private function documentDownloadRoute(Request $request): string
    {
        return $request->is('api/*')
            ? 'api.profile.documents.download'
            : 'profile.documents.download';
    }
}
