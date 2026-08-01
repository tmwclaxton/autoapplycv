/**
 * Worldwide phone parsing via libphonenumber-js.
 * Requires an explicit country context (E.164 "+" or defaultCountry ISO).
 * Never invents an extension.
 */

import {
    parsePhoneNumberFromString,
    getCountries,
    getCountryCallingCode,
} from 'libphonenumber-js/max';

/**
 * @typedef {Object} ParsedPhone
 * @property {boolean} valid
 * @property {boolean} possible
 * @property {string|null} e164
 * @property {string|null} nationalNumber
 * @property {string|null} countryCallingCode
 * @property {string|null} country
 * @property {string|null} extension
 * @property {string|null} reason
 */

/**
 * @param {string|null|undefined} dialCode e.g. "+44" or "44"
 * @returns {string|null} ISO country (best match for unique calling codes)
 */
export function countryFromDialCode(dialCode) {
    const digits = String(dialCode || '').replace(/\D/g, '');

    if (!digits) {
        return null;
    }

    const matches = getCountries().filter(
        (country) => getCountryCallingCode(country) === digits,
    );

    if (matches.length === 0) {
        return null;
    }

    // Prefer common defaults for shared calling codes.
    if (digits === '1') {
        if (matches.includes('US')) {
            return 'US';
        }
    }

    if (digits === '44' && matches.includes('GB')) {
        return 'GB';
    }

    return matches[0];
}

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function extractExplicitExtensionSuffix(value) {
    const text = String(value || '').trim();

    if (!text) {
        return null;
    }

    const match = text.match(
        /(?:\s*(?:ext\.?|extension|x)\s*|#|;|,)\s*([0-9]{1,8})\s*$/i,
    );

    return match?.[1] || null;
}

/**
 * Parse a phone number. Without a leading "+" or defaultCountry, returns invalid
 * with reason missing_country (do not guess).
 *
 * @param {string|null|undefined} raw
 * @param {{ defaultCountry?: string|null, defaultCallingCode?: string|null }} [options]
 * @returns {ParsedPhone}
 */
export function parseProfilePhone(raw, options = {}) {
    const text = String(raw || '').trim();

    if (!text) {
        return {
            valid: false,
            possible: false,
            e164: null,
            nationalNumber: null,
            countryCallingCode: null,
            country: null,
            extension: null,
            reason: 'empty',
        };
    }

    const defaultCountry =
        options.defaultCountry ||
        countryFromDialCode(options.defaultCallingCode) ||
        null;

    const hasPlus = text.startsWith('+');

    if (!hasPlus && !defaultCountry) {
        return {
            valid: false,
            possible: false,
            e164: null,
            nationalNumber: null,
            countryCallingCode: null,
            country: null,
            extension: null,
            reason: 'missing_country',
        };
    }

    let phone;

    try {
        phone = hasPlus
            ? parsePhoneNumberFromString(text)
            : parsePhoneNumberFromString(text, defaultCountry);
    } catch {
        phone = null;
    }

    if (!phone) {
        return {
            valid: false,
            possible: false,
            e164: null,
            nationalNumber: null,
            countryCallingCode: null,
            country: null,
            extension: extractExplicitExtensionSuffix(text),
            reason: 'unparseable',
        };
    }

    const extension =
        phone.ext || extractExplicitExtensionSuffix(text) || null;

    return {
        valid: phone.isValid(),
        possible: phone.isPossible(),
        e164: phone.number || null,
        nationalNumber: phone.nationalNumber || null,
        countryCallingCode: phone.countryCallingCode
            ? `+${phone.countryCallingCode}`
            : null,
        country: phone.country || defaultCountry || null,
        extension,
        reason: phone.isValid()
            ? null
            : phone.isPossible()
              ? 'invalid'
              : 'impossible',
    };
}

/**
 * Resolve dial/national/extension for apply forms.
 * Precedence: explicit profile extension > parser-confirmed extension on phone.
 *
 * @param {{
 *   phone?: string|null,
 *   phoneCountryCode?: string|null,
 *   phoneExtension?: string|null,
 * }} input
 * @returns {{
 *   e164: string,
 *   dialCode: string,
 *   nationalNumber: string,
 *   extension: string,
 *   country: string|null,
 *   valid: boolean,
 *   reason: string|null,
 * }}
 */
export function resolvePhonePartsForApply(input = {}) {
    const explicitExtension = String(input.phoneExtension || '').trim();
    const dialHint = String(input.phoneCountryCode || '').trim();
    const parsed = parseProfilePhone(input.phone, {
        defaultCallingCode: dialHint || null,
    });

    const extension = explicitExtension || parsed.extension || '';

    return {
        e164: parsed.e164 || '',
        dialCode: parsed.countryCallingCode || (dialHint.startsWith('+') ? dialHint : dialHint ? `+${dialHint.replace(/\D/g, '')}` : ''),
        nationalNumber: parsed.nationalNumber || '',
        extension,
        country: parsed.country,
        valid: parsed.valid,
        reason: parsed.reason,
    };
}

/**
 * True when the field asks for a PBX / desk extension, not a phone number.
 *
 * @param {{ label?: string, question?: string, name?: string, field_type?: string, dom?: { id?: string, name?: string } }|null} field
 * @returns {boolean}
 */
export function isPhoneExtensionField(field) {
    const label = String(field?.label || field?.question || '').trim();
    const name = String(field?.name || field?.dom?.name || field?.dom?.id || '').trim();
    const haystack = `${label} ${name}`.toLowerCase();

    if (!haystack.trim()) {
        return false;
    }

    // Exclude "phone number extension" meaning international dial companion / PhoneInput.
    if (
        /\b(country|dial)\b/.test(haystack) ||
        /\bphone\s*country\b/.test(haystack) ||
        /\bcountry\s*code\b/.test(haystack)
    ) {
        return false;
    }

    if (
        /(?:\b(?:phone|mobile|cell|telephone|tel)\s*)?(?:\bext\.?|\bextension)\b/.test(
            haystack,
        ) ||
        /\bext(?:ension)?(?:\s*(?:no\.?|number|#))?\b/.test(haystack) ||
        /(?:^|[_\-.])(?:x|ext)(?:$|[_\-.])/i.test(name) ||
        /extension/i.test(name)
    ) {
        // "browser extension", "chrome extension" etc.
        if (/\b(browser|chrome|firefox|safari|edge)\s+extension\b/.test(haystack)) {
            return false;
        }

        return true;
    }

    return false;
}

/**
 * True when the field is a primary telephone number control.
 *
 * @param {{ label?: string, question?: string, field_type?: string, dom?: { id?: string } }|null} field
 * @returns {boolean}
 */
export function isPrimaryPhoneField(field) {
    if (isPhoneExtensionField(field)) {
        return false;
    }

    const label = String(field?.label || field?.question || '');
    const domId = String(field?.dom?.id || '');

    if (field?.field_type === 'tel' || domId === 'phone') {
        return true;
    }

    return /^(?:phone(?:\s*number)?|mobile(?:\s*phone)?|mobile(?:\s*number)?|cell(?:\s*phone)?|telephone|telefon|téléphone)\b/i.test(
        label.trim(),
    );
}

/**
 * Format for a masked tel input (NANP national shape when +1).
 *
 * @param {ParsedPhone|ReturnType<typeof resolvePhonePartsForApply>} parts
 * @returns {string}
 */
export function formatNationalForMaskedTel(parts) {
    const dialDigits = String(parts.countryCallingCode || parts.dialCode || '').replace(
        /\D/g,
        '',
    );
    let digits = String(parts.nationalNumber || '').replace(/\D/g, '');

    if (!digits) {
        return '';
    }

    if (dialDigits === '1') {
        if (digits.length > 10) {
            digits = digits.slice(-10);
        }

        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
    }

    return digits;
}
