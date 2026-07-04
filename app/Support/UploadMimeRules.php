<?php

namespace App\Support;

class UploadMimeRules
{
    /**
     * @return list<string>
     */
    public static function cvUploadMimes(): array
    {
        return config('cv.cv_upload_mimes', ['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp']);
    }

    /**
     * @return list<string>
     */
    public static function documentUploadMimes(): array
    {
        return config('cv.document_upload_mimes', ['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'xls', 'xlsx']);
    }

    public static function cvUploadMaxKilobytes(): int
    {
        return (int) config('cv.cv_upload_max_kb', 10240);
    }

    public static function documentUploadMaxKilobytes(): int
    {
        return (int) config('cv.document_max_upload_kb', 10240);
    }

    public static function cvAcceptAttribute(): string
    {
        return self::acceptAttributeFor(self::cvUploadMimes());
    }

    public static function documentAcceptAttribute(): string
    {
        return self::acceptAttributeFor(self::documentUploadMimes());
    }

    public static function cvValidationMessage(): string
    {
        return 'Upload a PDF, Word document, plain text, or CV image (.pdf, .doc, .docx, .txt, .png, .jpg, .jpeg, .webp). Spreadsheets and executables are not accepted for CVs.';
    }

    public static function documentValidationMessage(): string
    {
        return 'Upload a PDF, Word document, image, spreadsheet, or plain text file (.pdf, .doc, .docx, .txt, .png, .jpg, .jpeg, .webp, .gif, .xls, .xlsx). Executables and archives are not accepted.';
    }

    /**
     * @param  list<string>  $extensions
     */
    private static function acceptAttributeFor(array $extensions): string
    {
        return implode(',', array_map(
            static fn (string $extension): string => '.'.ltrim(strtolower($extension), '.'),
            $extensions,
        ));
    }
}
