<?php

namespace App\Support;

use Smalot\PdfParser\Parser;

class PdfLinkExtractor
{
    /**
     * @return array<int, string>
     */
    public static function extract(string $absolutePath): array
    {
        if (! is_readable($absolutePath)) {
            return [];
        }

        try {
            $pdf = (new Parser)->parseFile($absolutePath);
        } catch (\Throwable) {
            return self::extractFromBinary($absolutePath);
        }

        $uris = [];

        foreach ($pdf->getObjects() as $object) {
            $header = $object->getHeader()->getDetails();

            if (($header['Type'] ?? null) !== 'Annot' || ($header['Subtype'] ?? null) !== 'Link') {
                continue;
            }

            $uri = $object->getDetails()['A']['URI'] ?? null;

            if (is_string($uri) && self::isUsefulUri($uri)) {
                $uris[] = self::normalizeUri($uri);
            }
        }

        return array_values(array_unique($uris));
    }

    /**
     * Fallback when pdfparser cannot parse the file structure.
     *
     * @return array<int, string>
     */
    private static function extractFromBinary(string $absolutePath): array
    {
        $contents = file_get_contents($absolutePath);

        if ($contents === false) {
            return [];
        }

        preg_match_all('/\/URI\s*\(([^)]+)\)/', $contents, $matches);

        return collect($matches[1] ?? [])
            ->filter(fn (string $uri) => self::isUsefulUri($uri))
            ->map(fn (string $uri) => self::normalizeUri($uri))
            ->unique()
            ->values()
            ->all();
    }

    private static function isUsefulUri(string $uri): bool
    {
        $uri = self::normalizeUri($uri);

        if ($uri === '') {
            return false;
        }

        if (str_starts_with(strtolower($uri), 'mailto:')) {
            return false;
        }

        if (str_starts_with(strtolower($uri), 'tel:')) {
            return false;
        }

        return str_starts_with(strtolower($uri), 'http://')
            || str_starts_with(strtolower($uri), 'https://');
    }

    private static function normalizeUri(string $uri): string
    {
        return trim(str_replace('\\', '', $uri));
    }
}
