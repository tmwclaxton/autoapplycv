<?php

namespace App\Services;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvUpload;
use App\Models\ProfileDocument;
use App\Models\User;

class CvProfileDocumentService
{
    public function recordCvUpload(
        User $user,
        string $storedPath,
        string $originalFilename,
        ?string $mimeType,
        int $fileSize,
    ): ProfileDocument {
        return ProfileDocument::firstOrCreate(
            [
                'user_id' => $user->id,
                'stored_path' => $storedPath,
            ],
            [
                'category' => ProfileDocumentCategory::Cv,
                'title' => pathinfo($originalFilename, PATHINFO_FILENAME) ?: 'CV',
                'original_filename' => $originalFilename,
                'mime_type' => $mimeType ?? 'application/octet-stream',
                'file_size' => $fileSize,
            ],
        );
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
}
