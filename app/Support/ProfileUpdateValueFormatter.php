<?php

namespace App\Support;

class ProfileUpdateValueFormatter
{
    public static function format(string $field, string $value): string
    {
        $value = trim($value);

        if ($value === '') {
            return '';
        }

        if ($field === 'postcode') {
            return mb_strtoupper($value);
        }

        if (! ProfileFieldRegistry::shouldPolishWrittenValue($field)) {
            return $value;
        }

        return self::normalizeCountryAbbreviations(self::titleCase($value));
    }

    private static function normalizeCountryAbbreviations(string $value): string
    {
        return (string) preg_replace('/,\s*Uk\b/u', ', UK', $value);
    }

    public static function titleCase(string $value): string
    {
        $parts = preg_split('/(\s+)/u', trim($value), -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];

        return implode('', array_map(
            static fn (string $part): string => preg_match('/^\s+$/u', $part) ? $part : self::titleCaseToken($part),
            $parts,
        ));
    }

    private static function titleCaseToken(string $token): string
    {
        if (str_contains($token, '-')) {
            return implode('-', array_map(self::titleCaseToken(...), explode('-', $token)));
        }

        if (preg_match("/^(.?)(['\u{2019}])(.+)$/u", $token, $matches)) {
            return self::titleCaseToken($matches[1])
                .$matches[2]
                .mb_convert_case($matches[3], MB_CASE_TITLE, 'UTF-8');
        }

        if (preg_match('/^mc(.+)$/iu', $token, $matches)) {
            return 'Mc'.mb_convert_case($matches[1], MB_CASE_TITLE, 'UTF-8');
        }

        if (preg_match('/^mac(.+)$/iu', $token, $matches) && strlen($matches[1]) > 2) {
            return 'Mac'.mb_convert_case($matches[1], MB_CASE_TITLE, 'UTF-8');
        }

        $upper = mb_strtoupper($token);

        if (in_array($upper, ['UK', 'USA', 'US', 'EU'], true)) {
            return $upper;
        }

        return mb_convert_case($token, MB_CASE_TITLE, 'UTF-8');
    }
}
