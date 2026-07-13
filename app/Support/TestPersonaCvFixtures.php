<?php

namespace App\Support;

use App\Services\CoverLetterPdfBuilder;
use Illuminate\Support\Facades\File;

class TestPersonaCvFixtures
{
    public const FIXTURE_PATH = 'tests/fixtures/auto-apply/test-personas.json';

    public const CV_DIR = 'tests/fixtures/test-personas/cvs';

    /**
     * @return array<string, mixed>
     */
    public static function loadFixture(): array
    {
        $path = base_path(self::FIXTURE_PATH);
        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded) || ! isset($decoded['personas']) || ! is_array($decoded['personas'])) {
            throw new \RuntimeException('Invalid test personas fixture.');
        }

        return $decoded;
    }

    /**
     * @param  array<string, mixed>  $persona
     * @param  array<string, mixed>  $profileData
     */
    public static function buildPdfBytes(array $persona, array $profileData, CoverLetterPdfBuilder $pdfBuilder): string
    {
        $profileForPdf = array_merge($profileData, [
            'email' => (string) ($persona['email'] ?? $profileData['email'] ?? ''),
        ]);

        return $pdfBuilder->build(
            CvFormattedTextBuilder::bodySections($profileForPdf),
            $profileForPdf,
            null,
            ['include_date' => false],
        );
    }

    /**
     * @param  array<string, mixed>  $persona
     * @param  array<string, mixed>  $profileData
     */
    public static function writePdf(array $persona, array $profileData, CoverLetterPdfBuilder $pdfBuilder): string
    {
        $cvFilename = (string) ($persona['cv_filename'] ?? 'cv.pdf');
        $fixturePdfPath = base_path(self::CV_DIR.'/'.$cvFilename);

        File::ensureDirectoryExists(dirname($fixturePdfPath));
        file_put_contents($fixturePdfPath, self::buildPdfBytes($persona, $profileData, $pdfBuilder));

        return $fixturePdfPath;
    }

    /**
     * @return array<int, string>
     */
    public static function regenerateAll(CoverLetterPdfBuilder $pdfBuilder, bool $force = false): array
    {
        $written = [];

        foreach (self::loadFixture()['personas'] as $personaId => $persona) {
            if (! is_array($persona)) {
                continue;
            }

            $cvFilename = (string) ($persona['cv_filename'] ?? '');

            if ($cvFilename === '') {
                throw new \RuntimeException("Persona {$personaId} is missing cv_filename.");
            }

            $fixturePdfPath = base_path(self::CV_DIR.'/'.$cvFilename);

            if (! $force && is_file($fixturePdfPath)) {
                continue;
            }

            $profileData = is_array($persona['profile'] ?? null) ? $persona['profile'] : [];
            $written[] = self::writePdf($persona, $profileData, $pdfBuilder);
        }

        return $written;
    }
}
