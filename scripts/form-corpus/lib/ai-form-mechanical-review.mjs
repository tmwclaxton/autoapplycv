import { reviewComplexity } from './form-complexity-score.mjs';
import { loadManifest } from './manifest.mjs';
import { buildPatternSignature, findVettedDuplicate } from './pattern-signature.mjs';
import { buildSnapshotFromHtml } from './snapshot-runner.mjs';
import { fieldCountBand } from './variety-matrix.mjs';

const MIN_FIELDS = 8;
const MIN_FIELD_TYPES = 4;
const MIN_LABEL_LENGTH = 3;

/**
 * @param {string} html
 * @returns {string[]}
 */
export function deterministicHtmlPatches(html) {
    let patched = html;

    patched = patched.replace(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');
    patched = patched.replace(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi, '');

    return patched;
}

/**
 * @param {string} html
 * @returns {{ ok: boolean, error?: string }}
 */
export function tryParseHtml(html) {
    try {
        buildSnapshotFromHtml({ html, pageUrl: 'https://example.test/apply', pageTitle: 'Apply' });

        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * @param {{
 *   html: string,
 *   id?: string,
 *   pageUrl?: string,
 *   pageTitle?: string,
 *   variety?: Record<string, unknown>,
 *   requiresInteraction?: boolean,
 *   complexityPatterns?: Array<{ id: string, notes: string, must_include: string[] }>,
 *   complexityTier?: string,
 *   minNonSemanticSignals?: number,
 *   minComplexityScore?: number,
 *   minFields?: number,
 *   widgets?: string[],
 * }} input
 */
export function buildMechanicalReview(input) {
    const issues = [];
    let html = input.html;

    if (/<script\b[^>]*\bsrc=/i.test(html)) {
        issues.push({ code: 'external_script', message: 'External script src detected' });
        html = deterministicHtmlPatches(html);
    }

    const parseCheck = tryParseHtml(html);

    if (!parseCheck.ok) {
        issues.push({ code: 'parse_error', message: parseCheck.error || 'HTML failed to parse in JSDOM' });
    }

    let snapshot = null;

    try {
        snapshot = buildSnapshotFromHtml({
            html,
            pageUrl: input.pageUrl || `https://example.test/forms/${input.id || 'draft'}`,
            pageTitle: input.pageTitle || 'Job Application',
        });
    } catch (error) {
        issues.push({
            code: 'snapshot_error',
            message: error instanceof Error ? error.message : String(error),
        });

        return {
            passed: false,
            issues,
            html,
            snapshot: null,
            pattern_signature: null,
        };
    }

    const elements = snapshot.elements || [];
    const fieldTypes = [...new Set(elements.map((row) => row.field_type || 'text'))];
    const shortLabels = elements.filter((row) => (row.question || '').trim().length < MIN_LABEL_LENGTH);
    const minFields = Math.max(MIN_FIELDS, Number(input.minFields) || 0);

    if (elements.length < minFields) {
        issues.push({
            code: 'too_few_fields',
            message: `Only ${elements.length} fields (min ${minFields})`,
        });
    }

    if (fieldTypes.length < MIN_FIELD_TYPES) {
        issues.push({
            code: 'too_few_field_types',
            message: `Only ${fieldTypes.length} field types (min ${MIN_FIELD_TYPES}): ${fieldTypes.join(', ')}`,
        });
    }

    if (shortLabels.length > 0) {
        issues.push({
            code: 'short_labels',
            message: `${shortLabels.length} fields have labels shorter than ${MIN_LABEL_LENGTH} chars`,
        });
    }

    const variety = {
        ...(input.variety || {}),
        field_count_band: input.variety?.field_count_band || fieldCountBand(elements.length),
    };

    const pattern_signature = buildPatternSignature({
        elements,
        variety,
        requires_interaction: input.requiresInteraction ?? false,
    });

    const manifest = loadManifest();
    const duplicate = findVettedDuplicate(manifest, pattern_signature, input.id || '');

    if (duplicate.duplicate) {
        issues.push({
            code: 'duplicate_signature',
            message: `Pattern signature matches vetted fixture ${duplicate.existing_id}`,
            existing_id: duplicate.existing_id,
        });
    }

    const complexity = reviewComplexity(html, input.complexityPatterns || [], {
        min_non_semantic_signals: input.minNonSemanticSignals,
        min_complexity_score: input.minComplexityScore,
        complexity_tier: input.complexityTier,
        widgets: input.widgets,
    });
    issues.push(...complexity.issues);

    return {
        passed: issues.length === 0,
        issues,
        html,
        snapshot,
        pattern_signature,
        field_count: elements.length,
        field_types: fieldTypes,
        complexity: complexity.score,
    };
}

/**
 * @param {ReturnType<typeof buildMechanicalReview>} review
 * @returns {Record<string, unknown>}
 */
export function failureReportFromReview(review) {
    return {
        passed: review.passed,
        issues: review.issues,
        field_count: review.field_count ?? 0,
        field_types: review.field_types ?? [],
        pattern_signature: review.pattern_signature,
    };
}
