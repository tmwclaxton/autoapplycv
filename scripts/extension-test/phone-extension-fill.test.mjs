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
});
