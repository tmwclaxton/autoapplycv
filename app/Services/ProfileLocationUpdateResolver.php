<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Support\ProfileFieldRegistry;

class ProfileLocationUpdateResolver
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    public function resolve(CvProfile $profile, array $conversation, string $assistantMessage): array
    {
        if (! $this->hasLocationMoveIntent($conversation, $assistantMessage)) {
            return [];
        }

        $targetPlace = $this->resolveTargetPlace($conversation, $assistantMessage);

        if ($targetPlace === null) {
            $targetPlace = $this->resolveTargetPlaceFromContext($conversation, $assistantMessage);
        }

        if ($targetPlace === null) {
            return [];
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'You turn a job seeker location move into structured profile field updates. '
                    .'Return JSON only: {"location_fields":{"location":"string|null","city":"string|null","postcode":"string|null","country":"string|null","address_line_1":"string|null","address_line_2":"string|null","state_region":"string|null"},"reason":"short explanation"}. '
                    .'When the user is moving to a new town or city, clear old street address lines unless they supplied a new street address in the conversation. '
                    .'Infer the correct county/state_region for the destination when moving within the same country. '
                    .'Use empty string to clear a field. Use null only when the field should stay unchanged from the current profile. '
                    .'Do not invent postcodes. Keep country when unchanged. '
                    .'Make location a concise display string suitable for a CV (for example "Tewkesbury, Gloucestershire").',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'target_place' => $targetPlace,
                    'current_location_fields' => $this->currentLocationFields($profile),
                    'conversation' => array_slice($conversation, -10),
                    'assistant_reply' => $assistantMessage,
                ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.2,
        ]);

        if ($payload === null || ! is_array($payload['location_fields'] ?? null)) {
            return [];
        }

        return $this->normalizeLocationFields($payload['location_fields'], (string) ($payload['reason'] ?? ''));
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    public function hasLocationMoveIntent(array $conversation, string $assistantMessage): bool
    {
        $parts = array_map(
            static fn (array $message): string => (string) ($message['content'] ?? ''),
            array_slice($conversation, -6),
        );
        $parts[] = $assistantMessage;

        $text = strtolower(implode("\n", $parts));

        if (preg_match('/\b(?:all|every|other)\s+(?:the\s+)?location(?:\s+fields|\s+values)?\b/', $text)) {
            return true;
        }

        if (preg_match('/\b(?:move|relocate|moving)\s+(?:to|near)\b/', $text)) {
            return true;
        }

        if (preg_match('/\b(?:i\s+)?(?:have\s+)?moved\s+to\b/', $text)) {
            return true;
        }

        if (preg_match('/\b(?:move|relocate|moving)\s+(?:my\s+)?(?:location|city|town|address)\s+(?:to|near)\b/', $text)) {
            return true;
        }

        if (preg_match('/\b(?<!will\s)(?:update|set|change)\s+(?:my\s+)?(?:location|city|town|address)\b/', $text)) {
            return true;
        }

        if (preg_match('/\b(?:update|set|change)\s+(?:all\s+)?location\s+fields?\b/', $text)) {
            return true;
        }

        if (preg_match('/\blocation\s+field\s+(?:though|too|also|as well)\b/', $text)) {
            return true;
        }

        if (preg_match('/\b(?:address line 1|street address|state\s*\/\s*region|state region)\b/', $text)
            && preg_match('/\b(?:clear|blank|update|set|move)\b/', $text)) {
            return true;
        }

        return false;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    private function resolveTargetPlace(array $conversation, string $assistantMessage): ?string
    {
        $messages = $conversation;
        $messages[] = ['role' => 'assistant', 'content' => $assistantMessage];

        for ($index = count($messages) - 1; $index >= 0; $index--) {
            $content = trim((string) ($messages[$index]['content'] ?? ''));

            if ($content === '') {
                continue;
            }

            if (preg_match('/\b(?:location|city|town)\b[^.!\n]{0,40}\b(?:to|as)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\b(?:move|relocate|moving)\s+(?:to|near)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\b(?:i\s+)?(?:have\s+)?moved\s+to\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\b(?:move|relocate|moving)\s+(?:my\s+)?(?:location|city|town|address)\s+(?:to|near)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\b(?:update|set|change)\s+(?:all\s+)?location\s+fields?\s+(?:to|as)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\b(?:update|set|change)\s+(?:the\s+)?location(?:\s+on\s+my\s+profile)?\s+(?:to|as)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\blocation\s+fields?\s+will\s+(?:align with|update to)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\blocation(?:\s+field)?\s+will\s+update\s+to\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\blocation\b[^.!\n]{0,50}\b(?:will be |be )?(?:set to|updated to|changed to)\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }

            if (preg_match('/\btown\s+to\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }
        }

        return null;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    private function resolveTargetPlaceFromContext(array $conversation, string $assistantMessage): ?string
    {
        unset($assistantMessage);

        for ($index = count($conversation) - 1; $index >= 0; $index--) {
            $content = trim((string) ($conversation[$index]['content'] ?? ''));

            if ($content === '' || ($conversation[$index]['role'] ?? '') !== 'user') {
                continue;
            }

            if (preg_match('/\b(?:address|location)\s+to\s+(.+?)(?:[.!,]|$)/iu', $content, $match)) {
                $place = $this->inferPlaceFromAddressFragment($match[1]);

                if ($place !== null) {
                    return $place;
                }
            }

            if (preg_match('/,\s*([a-z][a-z\s\-]{2,40}?)\s+(?:[a-z]{1,2}\d[\da-z]?\s*\d[a-z]{2}|[a-z]{2,})\b/iu', $content, $match)) {
                return $this->cleanPlace($match[1]);
            }
        }

        return null;
    }

    private function inferPlaceFromAddressFragment(string $address): ?string
    {
        $address = trim($address);

        if ($address === '') {
            return null;
        }

        if (preg_match('/,\s*([^,]+?)\s+([a-z][a-z\s\-]{2,40})\s+(?:[a-z]{1,2}\d[\da-z]?\s*\d[a-z]{2}|[a-z]{1,2}\d{1,2}[a-z]?\d[a-z]{2})\b/iu', $address, $match)) {
            return $this->cleanPlace($match[1].', '.$match[2]);
        }

        if (preg_match('/\b([a-z][a-z\s\-]{2,40})\s+([a-z][a-z\s\-]{2,40})\s+(?:[a-z]{1,2}\d[\da-z]?\s*\d[a-z]{2}|[a-z]{1,2}\d{1,2}[a-z]?\d[a-z]{2})\b/iu', $address, $match)) {
            return $this->cleanPlace($match[1].', '.$match[2]);
        }

        if (preg_match('/,\s*([^,]+)$/iu', $address, $match)) {
            $tail = trim($match[1]);

            if (preg_match('/^(.+?)\s+([a-z][a-z\s\-]{2,40})\s+(?:[a-z]{1,2}\d[\da-z]?\s*\d[a-z]{2}|[a-z]{1,2}\d{1,2}[a-z]?\d[a-z]{2})\b/iu', $tail, $parts)) {
                return $this->cleanPlace($parts[1].', '.$parts[2]);
            }
        }

        return null;
    }

    /**
     * @return array<string, string|null>
     */
    private function currentLocationFields(CvProfile $profile): array
    {
        $structured = is_array($profile->structured_data) ? $profile->structured_data : [];

        return [
            'location' => $profile->location,
            'city' => $profile->city,
            'postcode' => $profile->postcode,
            'country' => $profile->country,
            'address_line_1' => isset($structured['address_line_1']) ? (string) $structured['address_line_1'] : null,
            'address_line_2' => isset($structured['address_line_2']) ? (string) $structured['address_line_2'] : null,
            'state_region' => isset($structured['state_region']) ? (string) $structured['state_region'] : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $locationFields
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function normalizeLocationFields(array $locationFields, string $reason): array
    {
        $fieldMap = [
            'location' => 'location',
            'city' => 'city',
            'postcode' => 'postcode',
            'country' => 'country',
            'address_line_1' => 'structured_data.address_line_1',
            'address_line_2' => 'structured_data.address_line_2',
            'state_region' => 'structured_data.state_region',
        ];

        $updates = [];

        foreach ($fieldMap as $payloadKey => $registryKey) {
            if (! array_key_exists($payloadKey, $locationFields)) {
                continue;
            }

            $rawValue = $locationFields[$payloadKey];

            if ($rawValue === null) {
                continue;
            }

            $metadata = ProfileFieldRegistry::metadata($registryKey);

            if ($metadata === null) {
                continue;
            }

            $value = is_string($rawValue) ? trim($rawValue) : $rawValue;

            $updates[] = [
                'field' => $registryKey,
                'label' => $metadata['label'],
                'value' => $value,
                'reason' => $reason !== '' ? $reason : 'Smart location move.',
                'dashboard_tab' => $metadata['tab'],
                'dashboard_anchor' => $metadata['anchor'],
                'path' => $metadata['path'],
            ];
        }

        return $updates;
    }

    private function cleanPlace(string $place): string
    {
        $place = trim((string) preg_replace('/[.!?]+$/', '', trim($place)));

        return preg_replace('/\s+(?:please|thanks|thank you)$/iu', '', $place) ?? $place;
    }
}
