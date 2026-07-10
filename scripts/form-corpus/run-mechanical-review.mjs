#!/usr/bin/env node
/**
 * Mechanical review for AI-generated HTML.
 *
 * Usage:
 *   node scripts/form-corpus/run-mechanical-review.mjs --html-file=path --id=syn-ai-0001
 */
import { readFileSync } from 'node:fs';
import { buildMechanicalReview, failureReportFromReview } from './lib/ai-form-mechanical-review.mjs';

function parseArg(name) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : null;
}

const htmlFile = parseArg('html-file');
const id = parseArg('id') || 'draft';
const pageUrl = parseArg('page-url') || `https://example.test/forms/${id}`;
const pageTitle = parseArg('page-title') || 'Job Application';
const briefFile = parseArg('brief-file');

if (!htmlFile) {
    console.error('Usage: run-mechanical-review.mjs --html-file=path [--id=...] [--brief-file=...]');
    process.exit(1);
}

const html = readFileSync(htmlFile, 'utf8');
const reviewInput = {
    html,
    id,
    pageUrl,
    pageTitle,
    complexityPatterns: [],
};

if (briefFile) {
    try {
        const brief = JSON.parse(readFileSync(briefFile, 'utf8'));
        reviewInput.complexityPatterns = brief.constraints?.required_complexity_patterns || [];
        reviewInput.complexityTier = brief.constraints?.complexity_tier;
        reviewInput.minNonSemanticSignals = brief.constraints?.min_non_semantic_signals;
        reviewInput.minComplexityScore = brief.constraints?.min_complexity_score;
        reviewInput.minFields = brief.constraints?.min_fields;
        reviewInput.widgets = brief.variety?.widgets;
    } catch {
        // ignore invalid brief sidecar
    }
}

const review = buildMechanicalReview(reviewInput);
const report = failureReportFromReview(review);

console.log(JSON.stringify({
    ...report,
    html: review.html,
    complexity: review.complexity ?? null,
}, null, 2));

process.exit(review.passed ? 0 : 1);
