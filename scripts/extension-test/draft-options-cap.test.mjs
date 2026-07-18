import assert from 'node:assert/strict';
import test from 'node:test';
import {
    compactFieldsForDraft,
    compactSnapshotForInventory,
    truncateOptionsForApi,
} from '../../extension/src/shared/draft-all-optimizations.js';

test('truncateOptionsForApi caps at 64 and keeps Reed/Yes options', () => {
    const options = [
        ...Array.from({ length: 80 }, (_, i) => `Source ${i}`),
        'Reed',
        'Yes',
    ];
    const truncated = truncateOptionsForApi(options);

    assert.equal(truncated.length, 64);
    assert.ok(truncated.includes('Reed'));
    assert.ok(truncated.includes('Yes'));
});

test('compactFieldsForDraft clamps Workable-sized max_chars for API validation', () => {
    const [field] = compactFieldsForDraft([
        {
            id: 9,
            ref: 'f9',
            label: 'cover letter',
            field_type: 'textarea',
            max_chars: 200000,
        },
    ]);

    assert.equal(field.max_chars, 5000);
});

test('compactSnapshotForInventory truncates oversized options', () => {
    const snapshot = compactSnapshotForInventory({
        page_url: 'https://www.reed.co.uk/jobs/x',
        page_title: 'Job',
        elements: [{
            ref: 'f1',
            question: 'Where did you hear about this role?',
            field_type: 'checkbox',
            options: Array.from({ length: 90 }, (_, i) => `Opt ${i}`).concat(['Reed']),
            required: true,
        }],
    });

    assert.equal(snapshot.elements[0].options.length, 64);
    assert.ok(snapshot.elements[0].options.includes('Reed'));
});
