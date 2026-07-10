import assert from 'node:assert/strict';
import test from 'node:test';
import {
    COUNT_TOLERANCE,
    LABEL_JACCARD_MIN,
    diffInventoryOracles,
    jaccardSimilarity,
    normalizeOracleFields,
} from './lib/inventory-oracle-diff.mjs';
import {
    buildInventoryOraclePayload,
    normalizeInventoryOracleResult,
} from './lib/inventory-oracle.mjs';

test('normalizeOracleFields drops empty questions', () => {
    const fields = normalizeOracleFields([
        { question: 'Full name', field_type: 'text' },
        { question: '  ', field_type: 'email' },
        { label: 'Email', type: 'email' },
    ]);

    assert.equal(fields.length, 2);
    assert.equal(fields[0].question, 'Full name');
    assert.equal(fields[1].field_type, 'email');
});

test('normalizeOracleFields drops ATS autofill chrome labels', () => {
    const fields = normalizeOracleFields([
        { question: 'Full name', field_type: 'text' },
        { question: 'Import resume', field_type: 'file' },
        { question: 'Autofill with Resume', field_type: 'other' },
        { question: 'Email', field_type: 'email' },
    ]);

    assert.deepEqual(
        fields.map((field) => field.question),
        ['Full name', 'Email'],
    );
});

test('diffInventoryOracles agrees when Import resume is the only ai_only chrome', () => {
    const detector = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'Resume', field_type: 'file' },
        { question: 'LinkedIn', field_type: 'url' },
        { question: 'Gender', field_type: 'radio' },
    ];
    const ai = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'Resume', field_type: 'file' },
        { question: 'Import resume', field_type: 'file' },
    ];

    const result = diffInventoryOracles(detector, ai);

    assert.equal(result.status, 'agree');
    assert.equal(result.ai_only.length, 0);
});

test('jaccardSimilarity handles empty and overlap', () => {
    assert.equal(jaccardSimilarity([], []), 1);
    assert.equal(jaccardSimilarity(['a'], []), 0);
    assert.ok(jaccardSimilarity(['a', 'b'], ['b', 'c']) > 0.3);
});

test('diffInventoryOracles agrees on matching inventories', () => {
    const detector = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'Resume', field_type: 'file' },
    ];
    const ai = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'Resume', field_type: 'file' },
    ];

    const result = diffInventoryOracles(detector, ai);

    assert.equal(result.status, 'agree');
    assert.ok(result.metrics.label_jaccard >= LABEL_JACCARD_MIN);
    assert.ok(result.metrics.count_delta <= COUNT_TOLERANCE);
});

test('diffInventoryOracles agrees when ai_only empty despite count delta', () => {
    const detector = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'Resume', field_type: 'file' },
        { question: 'Gender', field_type: 'radio' },
        { question: 'Race', field_type: 'radio' },
        { question: 'Veteran status', field_type: 'radio' },
    ];
    const ai = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'Resume', field_type: 'file' },
    ];

    const result = diffInventoryOracles(detector, ai);

    assert.equal(result.status, 'agree');
    assert.equal(result.ai_only.length, 0);
});

test('diffInventoryOracles disagrees when AI finds many extra fields', () => {
    const detector = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
    ];
    const ai = [
        { question: 'Full name', field_type: 'text' },
        { question: 'Email', field_type: 'email' },
        { question: 'Phone', field_type: 'tel' },
        { question: 'LinkedIn', field_type: 'url' },
        { question: 'Portfolio', field_type: 'url' },
        { question: 'Cover letter', field_type: 'textarea' },
    ];

    const result = diffInventoryOracles(detector, ai);

    assert.equal(result.status, 'disagree');
    assert.ok(result.ai_only.length > 0);
});

test('diffInventoryOracles disagrees on label mismatch', () => {
    const detector = [
        { question: 'Applicant legal name', field_type: 'text' },
        { question: 'Work email address', field_type: 'email' },
        { question: 'Mobile telephone', field_type: 'tel' },
    ];
    const ai = [
        { question: 'Salary expectation', field_type: 'text' },
        { question: 'Start date', field_type: 'date' },
        { question: 'Visa status', field_type: 'select' },
    ];

    const result = diffInventoryOracles(detector, ai);

    assert.equal(result.status, 'disagree');
    assert.ok(result.reasons.some((reason) => /label Jaccard/.test(reason)));
});

test('buildInventoryOraclePayload is HTML-only', () => {
    const payload = buildInventoryOraclePayload({
        url: 'https://jobs.example.com/apply',
        pageTitle: 'Apply',
        html: '<form><label>Name</label><input name="name"></form>',
        htmlChars: 500,
    });

    assert.equal(payload.url, 'https://jobs.example.com/apply');
    assert.ok(payload.html_excerpt.includes('input'));
    assert.equal('mechanical' in payload, false);
    assert.equal('fields' in payload, false);
    assert.equal('inventory' in payload, false);
});

test('normalizeInventoryOracleResult maps fields and errors', () => {
    const ok = normalizeInventoryOracleResult({
        fields: [
            {
                question: 'Email',
                field_type: 'email',
                required: true,
                options: ['a', ''],
            },
        ],
        notes: 'ok',
        model: 'test-model',
    });

    assert.equal(ok.fields.length, 1);
    assert.equal(ok.fields[0].required, true);
    assert.deepEqual(ok.fields[0].options, ['a']);
    assert.equal(ok.model, 'test-model');

    const bad = normalizeInventoryOracleResult(null);
    assert.equal(bad.fields.length, 0);
    assert.ok(bad.error);
});
