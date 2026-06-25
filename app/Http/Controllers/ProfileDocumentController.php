<?php

namespace App\Http\Controllers;

use App\Enums\ProfileDocumentCategory;
use App\Http\Requests\StoreProfileDocumentRequest;
use App\Models\CvUpload;
use App\Models\ProfileDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProfileDocumentController extends Controller
{
    public function store(StoreProfileDocumentRequest $request): JsonResponse
    {
        $user = $request->user();
        $maxDocuments = (int) config('cv.max_profile_documents', 25);

        if ($user->profileDocuments()->count() >= $maxDocuments) {
            return response()->json([
                'message' => "You can store up to {$maxDocuments} documents. Delete one to upload another.",
            ], 422);
        }

        $file = $request->file('file');
        $category = ProfileDocumentCategory::from($request->string('category')->toString());
        $originalFilename = $file->getClientOriginalName();
        $title = $request->filled('title')
            ? $request->string('title')->toString()
            : pathinfo($originalFilename, PATHINFO_FILENAME);

        $storedPath = $file->store("profile-documents/{$user->id}", 'local');

        $document = ProfileDocument::create([
            'user_id' => $user->id,
            'category' => $category,
            'title' => $title,
            'original_filename' => $originalFilename,
            'stored_path' => $storedPath,
            'mime_type' => $file->getMimeType() ?? 'application/octet-stream',
            'file_size' => $file->getSize(),
            'notes' => $request->input('notes'),
        ]);

        return response()->json([
            'success' => true,
            'document' => $document->toFrontendArray(),
        ], 201);
    }

    public function destroy(Request $request, ProfileDocument $profileDocument): JsonResponse
    {
        $this->ensureOwner($request, $profileDocument);

        $profileDocument->delete();

        if (! $this->storedPathIsReferenced($profileDocument->stored_path)) {
            Storage::disk('local')->delete($profileDocument->stored_path);
        }

        return response()->json([
            'success' => true,
        ]);
    }

    public function download(Request $request, ProfileDocument $profileDocument): StreamedResponse
    {
        $this->ensureOwner($request, $profileDocument);

        if (! Storage::disk('local')->exists($profileDocument->stored_path)) {
            abort(404, 'File not found.');
        }

        return Storage::disk('local')->download(
            $profileDocument->stored_path,
            $profileDocument->original_filename,
        );
    }

    private function storedPathIsReferenced(string $storedPath): bool
    {
        return ProfileDocument::query()->where('stored_path', $storedPath)->exists()
            || CvUpload::query()->where('stored_path', $storedPath)->exists();
    }

    private function ensureOwner(Request $request, ProfileDocument $profileDocument): void
    {
        if ($request->user()?->id !== $profileDocument->user_id) {
            abort(403);
        }
    }
}
