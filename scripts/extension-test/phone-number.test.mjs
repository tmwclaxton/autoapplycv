import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    countryFromDialCode,
    formatNationalForMaskedTel,
    isPhoneExtensionField,
    isPrimaryPhoneField,
    parseProfilePhone,
    resolvePhonePartsForApply,
} from '../../extension/src/shared/phone-number.js';

describe('parseProfilePhone worldwide', () => {
    test('parses E.164 UK mobile', () => {
        const parsed = parseProfilePhone('+447400123456');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'GB');
        assert.equal(parsed.countryCallingCode, '+44');
        assert.equal(parsed.nationalNumber, '7400123456');
        assert.equal(parsed.extension, null);
    });

    test('parses US E.164', () => {
        const parsed = parseProfilePhone('+12025550123');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'US');
        assert.equal(parsed.nationalNumber, '2025550123');
    });

    test('parses India E.164', () => {
        const parsed = parseProfilePhone('+919876543210');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'IN');
        assert.equal(parsed.countryCallingCode, '+91');
    });

    test('parses Japan E.164', () => {
        const parsed = parseProfilePhone('+81312345678');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'JP');
    });

    test('parses Australia E.164', () => {
        const parsed = parseProfilePhone('+61412345678');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'AU');
    });

    test('parses France E.164', () => {
        const parsed = parseProfilePhone('+33612345678');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'FR');
    });

    test('parses Germany E.164', () => {
        const parsed = parseProfilePhone('+4915123456789');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'DE');
    });

    test('parses Brazil E.164', () => {
        const parsed = parseProfilePhone('+5511987654321');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'BR');
    });

    test('parses Nigeria E.164', () => {
        const parsed = parseProfilePhone('+2348012345678');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'NG');
    });

    test('parses UAE E.164', () => {
        const parsed = parseProfilePhone('+971501234567');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'AE');
    });

    test('parses Singapore E.164', () => {
        const parsed = parseProfilePhone('+6591234567');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'SG');
    });

    test('parses South Africa E.164', () => {
        const parsed = parseProfilePhone('+27821234567');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'ZA');
    });

    test('national number with explicit default country', () => {
        const parsed = parseProfilePhone('07400123456', {
            defaultCallingCode: '+44',
        });
        assert.equal(parsed.valid, true);
        assert.equal(parsed.country, 'GB');
        assert.equal(parsed.e164, '+447400123456');
    });

    test('rejects ambiguous national number without country', () => {
        const parsed = parseProfilePhone('07400123456');
        assert.equal(parsed.valid, false);
        assert.equal(parsed.reason, 'missing_country');
    });

    test('extracts ext. suffix', () => {
        const parsed = parseProfilePhone('+12025550123 ext. 204');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.extension, '204');
        assert.equal(parsed.nationalNumber, '2025550123');
    });

    test('extracts x suffix', () => {
        const parsed = parseProfilePhone('+442071234567 x89');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.extension, '89');
    });

    test('extracts extension word', () => {
        const parsed = parseProfilePhone('+33123456789 extension 12');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.extension, '12');
    });

    test('extracts semicolon pause extension', () => {
        const parsed = parseProfilePhone('+12025550123;204');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.extension, '204');
    });

    test('extracts comma pause extension', () => {
        const parsed = parseProfilePhone('+12025550123,99');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.extension, '99');
    });

    test('extracts hash extension', () => {
        const parsed = parseProfilePhone('+12025550123#1234');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.extension, '1234');
    });

    test('handles punctuation and whitespace in E.164', () => {
        const parsed = parseProfilePhone('+44 7400 123 456');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.e164, '+447400123456');
    });

    test('handles US parentheses format with country', () => {
        const parsed = parseProfilePhone('+1 (202) 555-0123');
        assert.equal(parsed.valid, true);
        assert.equal(parsed.nationalNumber, '2025550123');
    });

    test('does not invent extension when absent', () => {
        const parsed = parseProfilePhone('+447400123456');
        assert.equal(parsed.extension, null);
    });

    test('masked-looking incomplete number is not valid', () => {
        const parsed = parseProfilePhone('+44 **** ***123');
        assert.equal(parsed.valid, false);
    });

    test('empty returns empty reason', () => {
        assert.equal(parseProfilePhone('').reason, 'empty');
    });
});

describe('resolvePhonePartsForApply precedence', () => {
    test('explicit profile extension wins over phone suffix', () => {
        const parts = resolvePhonePartsForApply({
            phone: '+12025550123 ext. 111',
            phoneExtension: '999',
            phoneCountryCode: '+1',
        });
        assert.equal(parts.extension, '999');
        assert.equal(parts.nationalNumber, '2025550123');
    });

    test('uses parser extension when profile extension empty', () => {
        const parts = resolvePhonePartsForApply({
            phone: '+12025550123 x42',
            phoneCountryCode: '+1',
        });
        assert.equal(parts.extension, '42');
    });

    test('leaves extension empty when none present', () => {
        const parts = resolvePhonePartsForApply({
            phone: '+447400123456',
            phoneCountryCode: '+44',
        });
        assert.equal(parts.extension, '');
        assert.equal(parts.valid, true);
    });
});

describe('field classification', () => {
    test('detects phone extension fields', () => {
        assert.equal(
            isPhoneExtensionField({ label: 'Phone Extension' }),
            true,
        );
        assert.equal(isPhoneExtensionField({ label: 'Ext.' }), true);
        assert.equal(isPhoneExtensionField({ label: 'Extension #' }), true);
        assert.equal(
            isPhoneExtensionField({ name: 'phone_ext', label: '' }),
            true,
        );
    });

    test('does not treat country dial as extension', () => {
        assert.equal(
            isPhoneExtensionField({ label: 'Phone country code' }),
            false,
        );
        assert.equal(
            isPhoneExtensionField({ label: 'Country dial code' }),
            false,
        );
    });

    test('primary phone excludes extension fields', () => {
        assert.equal(isPrimaryPhoneField({ label: 'Phone number' }), true);
        assert.equal(isPrimaryPhoneField({ field_type: 'tel' }), true);
        assert.equal(
            isPrimaryPhoneField({ label: 'Phone Extension' }),
            false,
        );
    });
});

describe('formatNationalForMaskedTel', () => {
    test('formats NANP national', () => {
        assert.equal(
            formatNationalForMaskedTel({
                dialCode: '+1',
                nationalNumber: '2025550123',
            }),
            '(202) 555-0123',
        );
    });

    test('returns digits for non-NANP', () => {
        assert.equal(
            formatNationalForMaskedTel({
                dialCode: '+44',
                nationalNumber: '7700900123',
            }),
            '7700900123',
        );
    });
});

describe('countryFromDialCode', () => {
    test('maps +44 to GB', () => {
        assert.equal(countryFromDialCode('+44'), 'GB');
    });

    test('maps +1 to US', () => {
        assert.equal(countryFromDialCode('+1'), 'US');
    });
});
