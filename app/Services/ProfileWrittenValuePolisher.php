<?php

namespace App\Services;

use App\Support\ProfileFieldRegistry;
use App\Support\ProfileUpdateValueFormatter;

class ProfileWrittenValuePolisher
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{field: string, label?: string, value: mixed, reason?: string, dashboard_tab?: string, dashboard_anchor?: string, path?: string}>  $updates
     * @return array<int, array{field: string, label?: string, value: mixed, reason?: string, dashboard_tab?: string, dashboard_anchor?: string, path?: string}>
     */
    public function polishUpdates(array $updates): array
    {
        if ($updates === []) {
            return [];
        }

        foreach ($updates as $index => $update) {
            if (! is_string($update['value'] ?? null)) {
                continue;
            }

            $updates[$index]['value'] = ProfileUpdateValueFormatter::format(
                (string) $update['field'],
                (string) $update['value'],
            );
        }

        $reviewCandidates = [];

        foreach ($updates as $index => $update) {
            if (! is_string($update['value'] ?? null)) {
                continue;
            }

            $field = (string) $update['field'];
            $value = trim((string) $update['value']);

            if ($value === '' || ! ProfileFieldRegistry::shouldReviewSpelling($field)) {
                continue;
            }

            $reviewCandidates[$index] = [
                'index' => $index,
                'field' => $field,
                'value' => $value,
            ];
        }

        if ($reviewCandidates === []) {
            return $updates;
        }

        $revised = $this->reviewSpellingWithNanoGpt(array_values($reviewCandidates));

        foreach ($revised as $index => $value) {
            if (! is_string($value) || trim($value) === '') {
                continue;
            }

            $updates[$index]['value'] = trim($value);
        }

        return $updates;
    }

    /**
     * @param  array<int, array{field: string, label?: string, value: mixed, reason?: string, dashboard_tab?: string, dashboard_anchor?: string, path?: string}>  $updates
     * @return array<int, array{field: string, label?: string, value: mixed, reason?: string, dashboard_tab?: string, dashboard_anchor?: string, path?: string}>
     */
    public function formatOnly(array $updates): array
    {
        foreach ($updates as $index => $update) {
            if (! is_string($update['value'] ?? null)) {
                continue;
            }

            $updates[$index]['value'] = ProfileUpdateValueFormatter::format(
                (string) $update['field'],
                (string) $update['value'],
            );
        }

        return $updates;
    }

    /**
     * @param  array<int, array{index: int, field: string, value: string}>  $candidates
     * @return array<int, string>
     */
    private function reviewSpellingWithNanoGpt(array $candidates): array
    {
        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'Fix capitalization and obvious spelling mistakes in profile field values the user typed in chat. '
                    .'Use UK English for places. Correct well-known personal names when misspelled (for example Wiggum not Wiggums). '
                    .'Return JSON only: {"entries":[{"index":0,"value":"corrected value"}]}. '
                    .'Return each value unchanged when already correct.',
            ],
            [
                'role' => 'user',
                'content' => json_encode(['entries' => $candidates], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.1,
        ]);

        if ($payload === null || ! is_array($payload['entries'] ?? null)) {
            return [];
        }

        $revised = [];

        foreach ($payload['entries'] as $entry) {
            if (! is_array($entry) || ! isset($entry['index'], $entry['value']) || ! is_string($entry['value'])) {
                continue;
            }

            $revised[(int) $entry['index']] = $entry['value'];
        }

        return $revised;
    }
}
