<?php

namespace App\Support;

use App\Models\CvProfile;

class CvExtractionProfileMerge
{
    /**
     * @var list<string>
     */
    private const SCALAR_FIELDS = [
        'full_name',
        'headline',
        'email',
        'phone',
        'location',
        'city',
        'postcode',
        'country',
        'linkedin_url',
        'website_url',
        'summary',
    ];

    /**
     * @var list<string>
     */
    private const SECTION_FIELDS = [
        'skills',
        'experience',
        'education',
        'structured_data',
    ];

    /**
     * Apply freshly extracted CV data onto an existing profile.
     *
     * @param  array<string, mixed>|null  $extracted
     * @return array<string, mixed>
     */
    public static function apply(?CvProfile $existing, ?array $extracted, string $rawText, bool $parseSucceeded): array
    {
        $attributes = [
            'raw_cv_text' => $rawText,
            'parsing_complete' => $parseSucceeded,
        ];

        if (! $parseSucceeded || $extracted === null) {
            $attributes['formatted_cv_text'] = null;

            return $attributes;
        }

        foreach (self::SCALAR_FIELDS as $field) {
            if (self::hasExtractedValue($extracted[$field] ?? null)) {
                $attributes[$field] = $extracted[$field];
            }
        }

        foreach (self::SECTION_FIELDS as $field) {
            if (array_key_exists($field, $extracted)) {
                $attributes[$field] = $extracted[$field];
            }
        }

        if (array_key_exists('formatted_cv_text', $extracted)) {
            $attributes['formatted_cv_text'] = $extracted['formatted_cv_text'];
        }

        if (array_key_exists('extra_context', $extracted)) {
            $attributes['extra_context'] = $extracted['extra_context'];
        }

        return $attributes;
    }

    private static function hasExtractedValue(mixed $value): bool
    {
        if ($value === null) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        return true;
    }
}
