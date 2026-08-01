<?php

namespace App\Services;

use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

class PhoneNumberParser
{
    /**
     * @return array{
     *     valid: bool,
     *     possible: bool,
     *     e164: ?string,
     *     national_number: ?string,
     *     country_calling_code: ?string,
     *     country: ?string,
     *     extension: ?string,
     *     reason: ?string
     * }
     */
    public function parse(?string $raw, ?string $defaultCallingCode = null): array
    {
        $text = trim((string) $raw);

        if ($text === '') {
            return $this->emptyResult('empty');
        }

        $util = PhoneNumberUtil::getInstance();
        $defaultRegion = $this->regionFromCallingCode($defaultCallingCode);
        $hasPlus = str_starts_with($text, '+');

        if (! $hasPlus && $defaultRegion === null) {
            return $this->emptyResult('missing_country', $this->extractExplicitExtension($text));
        }

        try {
            $number = $hasPlus
                ? $util->parse($text, null)
                : $util->parse($text, $defaultRegion);
        } catch (NumberParseException) {
            return $this->emptyResult('unparseable', $this->extractExplicitExtension($text));
        }

        $extension = $number->getExtension() ?: $this->extractExplicitExtension($text);
        $valid = $util->isValidNumber($number);
        $possible = $util->isPossibleNumber($number);

        return [
            'valid' => $valid,
            'possible' => $possible,
            'e164' => $util->format($number, PhoneNumberFormat::E164),
            'national_number' => (string) $number->getNationalNumber(),
            'country_calling_code' => '+'.$number->getCountryCode(),
            'country' => $util->getRegionCodeForNumber($number),
            'extension' => $extension !== null && $extension !== '' ? (string) $extension : null,
            'reason' => $valid ? null : ($possible ? 'invalid' : 'impossible'),
        ];
    }

    /**
     * @return array{
     *     e164: string,
     *     dial_code: string,
     *     national_number: string,
     *     extension: string,
     *     country: ?string,
     *     valid: bool,
     *     reason: ?string
     * }
     */
    public function resolveParts(
        ?string $phone,
        ?string $phoneCountryCode = null,
        ?string $phoneExtension = null,
    ): array {
        $parsed = $this->parse($phone, $phoneCountryCode);
        $explicitExtension = trim((string) $phoneExtension);

        return [
            'e164' => (string) ($parsed['e164'] ?? ''),
            'dial_code' => (string) ($parsed['country_calling_code'] ?? $this->normalizeDialCode($phoneCountryCode)),
            'national_number' => (string) ($parsed['national_number'] ?? ''),
            'extension' => $explicitExtension !== '' ? $explicitExtension : (string) ($parsed['extension'] ?? ''),
            'country' => $parsed['country'],
            'valid' => (bool) $parsed['valid'],
            'reason' => $parsed['reason'],
        ];
    }

    private function regionFromCallingCode(?string $dialCode): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $dialCode) ?: '';

        if ($digits === '') {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();
        $regions = $util->getRegionCodesForCountryCode((int) $digits);

        if ($regions === []) {
            return null;
        }

        if ($digits === '1' && in_array('US', $regions, true)) {
            return 'US';
        }

        if ($digits === '44' && in_array('GB', $regions, true)) {
            return 'GB';
        }

        return $regions[0];
    }

    private function normalizeDialCode(?string $dialCode): string
    {
        $digits = preg_replace('/\D+/', '', (string) $dialCode) ?: '';

        return $digits === '' ? '' : '+'.$digits;
    }

    private function extractExplicitExtension(string $text): ?string
    {
        if (preg_match('/(?:\s*(?:ext\.?|extension|x)\s*|#|;|,)\s*([0-9]{1,8})\s*$/i', $text, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }

    /**
     * @return array{
     *     valid: bool,
     *     possible: bool,
     *     e164: ?string,
     *     national_number: ?string,
     *     country_calling_code: ?string,
     *     country: ?string,
     *     extension: ?string,
     *     reason: ?string
     * }
     */
    private function emptyResult(string $reason, ?string $extension = null): array
    {
        return [
            'valid' => false,
            'possible' => false,
            'e164' => null,
            'national_number' => null,
            'country_calling_code' => null,
            'country' => null,
            'extension' => $extension,
            'reason' => $reason,
        ];
    }
}
