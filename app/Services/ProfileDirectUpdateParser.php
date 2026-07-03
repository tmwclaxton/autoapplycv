<?php

namespace App\Services;

use App\Support\ProfileFieldRegistry;
use App\Support\ProfileUpdateValueSanitizer;

class ProfileDirectUpdateParser
{
    /**
     * @return array<int, array{field: string, label: string, value: string, reason: string}>
     */
    public function parse(string $message): array
    {
        $message = trim($message);

        if ($message === '' || ! ProfileUpdateValueSanitizer::looksLikeProfileUpdateCommand($message)) {
            return [];
        }

        $message = (string) preg_replace(
            '/^\s*(?:please\s+)?(?:update|set|change)\s+(?:my\s+)?(?:profile(?:\s+fields?)?\s+)?/iu',
            '',
            $message,
        );

        $message = trim($message);

        if ($message === '') {
            return [];
        }

        $updates = [];

        foreach ($this->splitSegments($message) as $segment) {
            $segment = (string) preg_replace('/^\s*and\s+/iu', '', trim($segment));

            if ($segment === '') {
                continue;
            }

            $matched = $this->matchSegment($segment);

            if ($matched === null) {
                continue;
            }

            $updates[$matched['field']] = $matched;
        }

        return array_values($updates);
    }

    /**
     * @return array<int, string>
     */
    private function splitSegments(string $message): array
    {
        if (! str_contains($message, ',')) {
            return [$message];
        }

        return array_values(array_filter(array_map(trim(...), explode(',', $message)), fn (string $segment) => $segment !== ''));
    }

    /**
     * @return array{field: string, label: string, value: string, reason: string}|null
     */
    private function matchSegment(string $segment): ?array
    {
        foreach ($this->keywordEntries() as $entry) {
            foreach ($entry['keywords'] as $keyword) {
                $pattern = '/^'.preg_quote($keyword, '/').'(?:\s+to)?\s+(.+)$/iu';

                if (! preg_match($pattern, $segment, $matches)) {
                    continue;
                }

                $value = ProfileUpdateValueSanitizer::cleanCapturedValue($matches[1]);

                if ($value === '' || ProfileUpdateValueSanitizer::shouldRejectDirectValue($entry['field'], $value)) {
                    return null;
                }

                return [
                    'field' => $entry['field'],
                    'label' => $entry['label'],
                    'value' => $value,
                    'reason' => 'From your message.',
                ];
            }
        }

        return null;
    }

    /**
     * @return array<int, array{field: string, label: string, keywords: array<int, string>}>
     */
    private function keywordEntries(): array
    {
        static $entries = null;

        if ($entries !== null) {
            return $entries;
        }

        $entries = [];

        foreach (ProfileFieldRegistry::directParseFields() as $definition) {
            $keywords = $definition['keywords'];
            usort($keywords, static fn (string $left, string $right): int => strlen($right) <=> strlen($left));

            $entries[] = [
                'field' => $definition['field'],
                'label' => $definition['label'],
                'keywords' => $keywords,
            ];
        }

        usort($entries, static function (array $left, array $right): int {
            $leftLength = strlen($left['keywords'][0] ?? '');
            $rightLength = strlen($right['keywords'][0] ?? '');

            return $rightLength <=> $leftLength;
        });

        return $entries;
    }
}
