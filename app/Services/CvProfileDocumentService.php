<?php

namespace App\Services;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvUpload;
use App\Models\ProfileDocument;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

class CvProfileDocumentService
{
    public function clearExistingCvArtifacts(User $user): void
    {
        $paths = ProfileDocument::query()
            ->where('user_id', $user->id)
            ->where('category', ProfileDocumentCategory::Cv)
            ->pluck('stored_path');

        ProfileDocument::query()
            ->where('user_id', $user->id)
            ->where('category', ProfileDocumentCategory::Cv)
            ->delete();

        $uploadPaths = CvUpload::query()
            ->where('user_id', $user->id)
            ->pluck('stored_path');

        CvUpload::query()
            ->where('user_id', $user->id)
            ->delete();

        $paths
            ->merge($uploadPaths)
            ->unique()
            ->each(fn (string $path) => $this->deleteStoredFileIfUnreferenced($path));
    }

    public function recordCvUpload(
        User $user,
        string $storedPath,
        string $originalFilename,
        ?string $mimeType,
        int $fileSize,
    ): ProfileDocument {
        return ProfileDocument::create([
            'user_id' => $user->id,
            'category' => ProfileDocumentCategory::Cv,
            'title' => pathinfo($originalFilename, PATHINFO_FILENAME) ?: 'CV',
            'original_filename' => $originalFilename,
            'stored_path' => $storedPath,
            'mime_type' => $mimeType ?? 'application/octet-stream',
            'file_size' => $fileSize,
        ]);
    }

    public function backfillFromCvUploads(?int $userId = null): int
    {
        $created = 0;

        $query = CvUpload::query()->orderBy('id');

        if ($userId !== null) {
            $query->where('user_id', $userId);
        }

        foreach ($query->cursor() as $upload) {
            $document = ProfileDocument::query()
                ->where('user_id', $upload->user_id)
                ->where('stored_path', $upload->stored_path)
                ->first();

            if ($document !== null) {
                continue;
            }

            $existingCvCount = ProfileDocument::query()
                ->where('user_id', $upload->user_id)
                ->where('category', ProfileDocumentCategory::Cv)
                ->count();

            if ($existingCvCount >= 1) {
                continue;
            }

            $this->recordCvUpload(
                $upload->user,
                $upload->stored_path,
                $upload->original_filename,
                $upload->mime_type,
                (int) $upload->file_size,
            );

            $created++;
        }

        return $created;
    }

    private function deleteStoredFileIfUnreferenced(string $storedPath): void
    {
        if (ProfileDocument::query()->where('stored_path', $storedPath)->exists()) {
            return;
        }

        if (CvUpload::query()->where('stored_path', $storedPath)->exists()) {
            return;
        }

        Storage::disk('local')->delete($storedPath);
    }
}
