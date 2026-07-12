<?php

namespace App\Services;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvProfile;
use App\Models\ProfileDocument;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CoverLetterDocumentService
{
    public function __construct(
        private readonly CoverLetterPdfBuilder $pdfBuilder,
    ) {}

    /**
     * @param  array<string, mixed>  $job
     * @return array{
     *     saved: bool,
     *     duplicate: bool,
     *     document: ProfileDocument|null,
     * }
     */
    public function saveFromText(User $user, array $job, string $text, ?CvProfile $profile = null): array
    {
        $profile ??= $user->cvProfile;

        $pdfBytes = $this->pdfBuilder->build(
            $text,
            $profile?->only(['full_name', 'email', 'phone', 'city']),
            $job,
        );

        return $this->savePdfBytes(
            $user,
            $job,
            $pdfBytes,
            $this->buildFileName($job),
        );
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array{
     *     saved: bool,
     *     duplicate: bool,
     *     document: ProfileDocument|null,
     * }
     */
    public function savePdfBytes(User $user, array $job, string $pdfBytes, string $originalFilename): array
    {
        $sourceKey = $this->sourceKey($job);

        $existing = ProfileDocument::query()
            ->where('user_id', $user->id)
            ->where('category', ProfileDocumentCategory::CoverLetter)
            ->where('source_key', $sourceKey)
            ->first();

        if ($existing !== null) {
            return [
                'saved' => false,
                'duplicate' => true,
                'document' => $existing,
            ];
        }

        $maxDocuments = (int) config('cv.max_profile_documents', 25);

        if ($user->profileDocuments()->count() >= $maxDocuments) {
            return [
                'saved' => false,
                'duplicate' => false,
                'document' => null,
            ];
        }

        $storedPath = sprintf(
            'profile-documents/%d/%s',
            $user->id,
            Str::uuid()->toString().'.pdf',
        );

        Storage::disk('local')->put($storedPath, $pdfBytes);

        $document = ProfileDocument::create([
            'user_id' => $user->id,
            'category' => ProfileDocumentCategory::CoverLetter,
            'title' => $this->buildTitle($job),
            'original_filename' => $this->sanitizeFilename($originalFilename),
            'stored_path' => $storedPath,
            'mime_type' => 'application/pdf',
            'file_size' => strlen($pdfBytes),
            'notes' => $this->buildNotes($job),
            'source_key' => $sourceKey,
        ]);

        return [
            'saved' => true,
            'duplicate' => false,
            'document' => $document,
        ];
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function sourceKey(array $job): string
    {
        $link = strtolower(trim((string) ($job['link'] ?? '')));

        if ($link !== '') {
            return hash('sha256', $link);
        }

        $title = strtolower(trim((string) ($job['title'] ?? '')));
        $company = strtolower(trim((string) ($job['company'] ?? '')));

        return hash('sha256', "{$title}|{$company}");
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function buildTitle(array $job): string
    {
        $title = trim((string) ($job['title'] ?? ''));
        $company = trim((string) ($job['company'] ?? ''));

        if ($title !== '' && $company !== '') {
            return "Cover letter - {$title} at {$company}";
        }

        if ($title !== '') {
            return "Cover letter - {$title}";
        }

        if ($company !== '') {
            return "Cover letter - {$company}";
        }

        return 'Cover letter';
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function buildFileName(array $job): string
    {
        $slug = collect([
            $job['title'] ?? null,
            $job['company'] ?? null,
            'cover-letter',
        ])
            ->map(fn ($value): string => Str::slug((string) ($value ?? ''), '-'))
            ->filter(fn (string $value): bool => $value !== '')
            ->implode('-');

        return ($slug !== '' ? $slug : 'cover-letter').'.pdf';
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function buildNotes(array $job): string
    {
        $lines = [];

        $title = trim((string) ($job['title'] ?? ''));
        $company = trim((string) ($job['company'] ?? ''));

        if ($title !== '' || $company !== '') {
            $lines[] = trim("{$title} at {$company}", ' at');
        }

        $link = trim((string) ($job['link'] ?? ''));

        if ($link !== '') {
            $lines[] = $link;
        }

        $lines[] = 'Generated '.now()->format('j M Y H:i');

        return implode("\n", $lines);
    }

    private function sanitizeFilename(string $filename): string
    {
        $filename = trim($filename);

        if ($filename === '') {
            return 'cover-letter.pdf';
        }

        if (! str_ends_with(strtolower($filename), '.pdf')) {
            $filename .= '.pdf';
        }

        return Str::replace(['/', '\\'], '-', $filename);
    }
}
