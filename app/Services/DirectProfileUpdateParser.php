<?php

namespace App\Services;

use App\Support\ProfileFieldRegistry;

class DirectProfileUpdateParser
{
    /**
     * @return array<int, array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    public function parse(string $message): array
    {
        $message = trim($message);

        if ($message === '' || ! $this->looksLikeProfileCommand($message)) {
            return [];
        }

        $segments = preg_split('/[,;]|\band\b/i', $message) ?: [$message];
        $updates = [];
        $seenFields = [];

        foreach ($segments as $segment) {
            $update = $this->parseSegment(trim($segment));

            if ($update === null || isset($seenFields[$update['field']])) {
                continue;
            }

            $updates[] = $update;
            $seenFields[$update['field']] = true;
        }

        if ($updates === []) {
            $update = $this->parseSegment($message);

            if ($update !== null) {
                $updates[] = $update;
            }
        }

        return $updates;
    }

    private function looksLikeProfileCommand(string $message): bool
    {
        return (bool) preg_match(
            '/\b(?:update|set|change|clear|blank|apply)\b|\bdo it\b|\b(?:address|street)\s+(?:blank|clear|empty)\b|\b(?:region|state|county)\s+(?!.*\?\s*$)\S/iu',
            $message,
        );
    }

    /**
     * @return array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}|null
     */
    private function parseSegment(string $segment): ?array
    {
        if ($segment === '') {
            return null;
        }

        $lower = mb_strtolower($segment);

        foreach (ProfileFieldRegistry::directParseFields() as $spec) {
            foreach ($spec['keywords'] as $keyword) {
                $pattern = '/\b'.preg_quote($keyword, '/').'\b/u';

                if (! preg_match($pattern, $lower)) {
                    continue;
                }

                if (preg_match('/\b'.preg_quote($keyword, '/').'\s+(blank|clear|empty)\b/iu', $segment)
                    || preg_match('/\b(?:clear|blank|empty)\s+(?:the\s+)?'.preg_quote($keyword, '/').'\b/iu', $segment)) {
                    return $this->makeUpdate($spec, '');
                }

                if (preg_match('/\b'.preg_quote($keyword, '/').'\s+(?:to|as|=)\s*(.+)$/iu', $segment, $valueMatch)) {
                    return $this->makeUpdate($spec, $this->cleanValue($valueMatch[1]));
                }

                if (preg_match('/\b(?:update|set|change)\b.*\b'.preg_quote($keyword, '/').'\b.*\b(?:to|as)\s+(.+)$/iu', $segment, $valueMatch)) {
                    return $this->makeUpdate($spec, $this->cleanValue($valueMatch[1]));
                }

                if (preg_match('/\b'.preg_quote($keyword, '/').'\s+(?!blank|clear|empty|to|as\b)(.+)$/iu', $segment, $valueMatch)) {
                    $value = $this->cleanValue($valueMatch[1]);

                    if ($value !== '') {
                        return $this->makeUpdate($spec, $value);
                    }
                }
            }
        }

        if (preg_match('/\b(?:update|set|change)\b/i', $segment)
            && preg_match('/\b(?:to|as)\s+(.+)$/iu', $segment, $valueMatch)) {
            foreach (ProfileFieldRegistry::directParseFields() as $spec) {
                foreach ($spec['keywords'] as $keyword) {
                    if (preg_match('/\b'.preg_quote($keyword, '/').'\b/u', $lower)) {
                        return $this->makeUpdate($spec, $this->cleanValue($valueMatch[1]));
                    }
                }
            }
        }

        return null;
    }

    /**
     * @param  array{field: string, label: string, tab: string, anchor: string, path: string, keywords: array<int, string>}  $spec
     * @return array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}
     */
    private function makeUpdate(array $spec, string $value): array
    {
        return [
            'field' => $spec['field'],
            'label' => $spec['label'],
            'value' => $value,
            'reason' => 'Direct profile update command.',
            'dashboard_tab' => $spec['tab'],
            'dashboard_anchor' => $spec['anchor'],
            'path' => $spec['path'],
        ];
    }

    private function cleanValue(string $value): string
    {
        return trim((string) preg_replace('/[.!?]+$/', '', trim($value)));
    }
}
