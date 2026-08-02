import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    resolveProfileMappingForLabel,
    shouldRejectPhoneAnswerOnField,
} from '../../extension/src/shared/pending-fields.js';
import {
    isPhoneExtensionField,
    resolvePhonePartsForApply,
} from '../../extension/src/shared/phone-number.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('phone extension fill targeting', () => {
    test('maps Phone Extension label to _phone_extension', () => {
        const mapping = resolveProfileMappingForLabel('Phone Extension');
        assert.equal(mapping?.path, '_phone_extension');
    });

    test('maps Ext. exact label to _phone_extension', () => {
        const mapping = resolveProfileMappingForLabel('Ext.');
        assert.equal(mapping?.path, '_phone_extension');
    });

    test('rejects full E.164 phone answers on extension fields', () => {
        assert.equal(
            shouldRejectPhoneAnswerOnField(
                { label: 'Phone Extension' },
                '+447400123456',
            ),
            true,
        );
    });

    test('allows short extension digits on extension fields', () => {
        assert.equal(
            shouldRejectPhoneAnswerOnField({ label: 'Ext.' }, '204'),
            false,
        );
    });

    test('infers extension from profile phone for apply parts', () => {
        const parts = resolvePhonePartsForApply({
            phone: '+12025550123 x204',
            phoneCountryCode: '+1',
        });
        assert.equal(parts.extension, '204');
        assert.equal(isPhoneExtensionField({ label: 'Extension #' }), true);
    });

    test('pending-fields imports phone-number module', () => {
        const source = readFileSync(
            join(root, 'extension/src/shared/pending-fields.js'),
            'utf8',
        );
        assert.match(source, /from '\.\/phone-number\.js'/);
        assert.match(source, /_phone_extension/);
    });

    test('profile form exposes the explicit phone extension setting', () => {
        const source = readFileSync(
            join(root, 'resources/js/components/cv/CvProfileForm.vue'),
            'utf8',
        );

        assert.match(
            source,
            /id="field-phone-extension"[\s\S]*?profile\.application_settings\.phone_extension/,
        );
    });

    const regionalCases = [
        {
            region: 'NANP',
            phone: '+1 (202) 555-0123 ext. 204',
            dialCode: '+1',
            national: '2025550123',
            extension: '204',
        },
        {
            region: 'United Kingdom',
            phone: '+44 20 7123 4567 x89',
            dialCode: '+44',
            national: '2071234567',
            extension: '89',
        },
        {
            region: 'continental Europe',
            phone: '+33 1 23 45 67 89 extension 12',
            dialCode: '+33',
            national: '123456789',
            extension: '12',
        },
        {
            region: 'Asia-Pacific',
            phone: '+65 9123 4567;321',
            dialCode: '+65',
            national: '91234567',
            extension: '321',
        },
        {
            region: 'Africa',
            phone: '+27 82 123 4567#76',
            dialCode: '+27',
            national: '821234567',
            extension: '76',
        },
        {
            region: 'Latin America',
            phone: '+55 11 98765 4321,55',
            dialCode: '+55',
            national: '11987654321',
            extension: '55',
        },
    ];

    for (const scenario of regionalCases) {
        test(`${scenario.region} parses only an explicit extension`, () => {
            const withExtension = resolvePhonePartsForApply({
                phone: scenario.phone,
                phoneCountryCode: scenario.dialCode,
            });
            const withoutExtension = resolvePhonePartsForApply({
                phone: withExtension.e164,
                phoneCountryCode: scenario.dialCode,
            });

            assert.equal(withExtension.valid, true);
            assert.equal(withExtension.dialCode, scenario.dialCode);
            assert.equal(withExtension.nationalNumber, scenario.national);
            assert.equal(withExtension.extension, scenario.extension);
            assert.equal(withoutExtension.extension, '');
        });

        test(`${scenario.region} rejects a full phone on an extension field`, () => {
            const parts = resolvePhonePartsForApply({
                phone: scenario.phone,
                phoneCountryCode: scenario.dialCode,
            });

            assert.equal(
                shouldRejectPhoneAnswerOnField(
                    { label: 'Phone Extension', field_type: 'text' },
                    parts.e164,
                ),
                true,
            );
        });
    }
});
