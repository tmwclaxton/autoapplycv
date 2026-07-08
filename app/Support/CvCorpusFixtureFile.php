<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;

class CvCorpusFixtureFile
{
    public static function mimeType(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'pdf' => 'application/pdf',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc' => 'application/msword',
            'txt' => 'text/plain',
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            default => 'application/octet-stream',
        };
    }

    public static function uploadedFile(string $path): UploadedFile
    {
        return new UploadedFile(
            $path,
            basename($path),
            self::mimeType($path),
            null,
            true,
        );
    }
}
