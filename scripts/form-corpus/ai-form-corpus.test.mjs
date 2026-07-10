import assert from 'node:assert/strict';
import test from 'node:test';
import { composeAiFormBrief, parseTargetCell } from './lib/ai-form-brief.mjs';
import { assertBatchLimit, resolveBatchLimit } from './lib/batch-cap.mjs';
import { reviewComplexity } from './lib/form-complexity-score.mjs';
import { buildPatternSignature } from './lib/pattern-signature.mjs';

test('batch cap rejects limits above 50', () => {
    assert.throws(() => assertBatchLimit(51), /exceeds cap/);
    assert.equal(assertBatchLimit(50), 50);
    assert.equal(assertBatchLimit(51, { forceOverCap: true }), 51);
});

test('composeAiFormBrief is deterministic for same id', () => {
    const first = composeAiFormBrief({ id: 'syn-ai-0042' });
    const second = composeAiFormBrief({ id: 'syn-ai-0042' });

    assert.equal(first.seed, second.seed);
    assert.deepEqual(first.variety, second.variety);
    assert.equal(first.constraints.required_complexity_patterns.length, 3);
    assert.equal(first.constraints.reference_templates.length, 2);
    assert.equal(first.constraints.forbid_semantic_only, true);
});

test('composeAiFormBrief high tier demands production DOM complexity', () => {
    const brief = composeAiFormBrief({ id: 'syn-ai-0099', complexityTier: 'high' });

    assert.equal(brief.constraints.complexity_tier, 'high');
    assert.ok(brief.constraints.min_fields >= 14);
    assert.equal(brief.constraints.min_non_semantic_signals, 5);
    assert.equal(brief.constraints.min_complexity_score, 6);
    assert.equal(brief.constraints.required_complexity_patterns.length, 5);
    assert.equal(brief.constraints.reference_templates.length, 3);
    assert.match(brief.prompt_summary, /tier=high/);
});

test('parseTargetCell maps matrix input', () => {
    const cell = parseTargetCell('ashby,combobox,wizard,medium');

    assert.equal(cell?.ats_style, 'ashby');
    assert.deepEqual(cell?.widgets, ['combobox']);
    assert.equal(cell?.structure, 'wizard');
    assert.equal(cell?.field_count_band, 'medium');
});

test('reviewComplexity rejects tutorial semantic-only forms', () => {
    const html = `<form>
<label for="n">Name</label><input id="n" name="n">
<label for="e">Email</label><input id="e" name="e" type="email">
<label for="p">Phone</label><input id="p" name="p" type="tel">
<label for="c">City</label><input id="c" name="c">
<label for="r">Role</label><input id="r" name="r">
<label for="y">Years</label><input id="y" name="y" type="number">
<label for="l">LinkedIn</label><input id="l" name="l">
<label for="m">Message</label><textarea id="m" name="m"></textarea>
</form>`;
    const result = reviewComplexity(html);

    assert.ok(result.issues.some((issue) => issue.code === 'insufficient_complexity' || issue.code === 'too_semantic'));
});

test('buildPatternSignature is stable', () => {
    const signature = buildPatternSignature({
        elements: [
            { field_type: 'text' },
            { field_type: 'email' },
            { field_type: 'radio' },
        ],
        variety: {
            ats_style: 'ashby',
            widgets: ['combobox'],
            structure: 'single-page',
            field_count_band: 'small',
        },
    });

    assert.match(signature, /^ashby\|/);
    assert.match(signature, /single-page\|small\|/);
});
