<?php

namespace App\Support;

/**
 * Keep locality profile fields free of boolean Yes/No answers that leak in from
 * relocate / licence / live-in-city screening questions.
 */
class ProfileLocalitySanitizer
{
    /**
     * @var list<string>
     */
    public const LOCALITY_FIELDS = [
        'city',
        'location',
        'postcode',
        'country',
        'structured_data.address_line_1',
        'structured_data.address_line_2',
        'structured_data.state_region',
    ];

    public static function isLocalityField(string $field): bool
    {
        return in_array($field, self::LOCALITY_FIELDS, true);
    }

    public static function isBareYesNo(mixed $value): bool
    {
        if (! is_string($value)) {
            return false;
        }

        return (bool) preg_match('/^(yes|no|y|n|true|false)$/i', trim($value));
    }

    public static function cityFromLocation(?string $location): ?string
    {
        if ($location === null) {
            return null;
        }

        $trimmed = trim($location);

        if ($trimmed === '' || self::isBareYesNo($trimmed)) {
            return null;
        }

        $first = trim(explode(',', $trimmed, 2)[0]);

        if ($first === '' || self::isBareYesNo($first)) {
            return null;
        }

        return $first;
    }

    public static function sanitizeCity(?string $city, ?string $location = null): ?string
    {
        if ($city !== null && trim($city) !== '' && ! self::isBareYesNo($city)) {
            return trim($city);
        }

        return self::cityFromLocation($location);
    }

    public static function sanitizeLocalityValue(string $field, mixed $value): mixed
    {
        if (! self::isLocalityField($field) || ! is_string($value)) {
            return $value;
        }

        if (self::isBareYesNo($value)) {
            return null;
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function sanitizeProfileAttributes(array $attributes): array
    {
        $location = array_key_exists('location', $attributes)
            ? (is_string($attributes['location']) ? $attributes['location'] : null)
            : null;

        if (array_key_exists('location', $attributes) && self::isBareYesNo($attributes['location'] ?? null)) {
            $attributes['location'] = null;
            $location = null;
        }

        if (array_key_exists('city', $attributes)) {
            $city = is_string($attributes['city'] ?? null) ? $attributes['city'] : null;
            $attributes['city'] = self::sanitizeCity($city, $location);
        }

        foreach (['postcode', 'country'] as $field) {
            if (array_key_exists($field, $attributes) && self::isBareYesNo($attributes[$field] ?? null)) {
                $attributes[$field] = null;
            }
        }

        if (isset($attributes['structured_data']) && is_array($attributes['structured_data'])) {
            foreach (['address_line_1', 'address_line_2', 'state_region'] as $field) {
                if (array_key_exists($field, $attributes['structured_data'])
                    && self::isBareYesNo($attributes['structured_data'][$field] ?? null)) {
                    $attributes['structured_data'][$field] = null;
                }
            }
        }

        return $attributes;
    }
}
