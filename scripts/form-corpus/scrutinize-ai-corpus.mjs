#!/usr/bin/env node
/**
 * Scrutinize syn-ai-* fixtures: complexity scores, gaps, and repair recommendations.
 *
 * Usage:
 *   node scripts/form-corpus/scrutinize-ai-corpus.mjs
 *   node scripts/form-corpus/scrutinize-ai-corpus.mjs --id-prefix=syn-ai-
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMechanicalReview } from './lib/ai-form-mechanical-review.mjs';
import { reviewComplexity } from './lib/form-complexity-score.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';

const REPORT_PATH = join(FIXTURE_ROOT, 'ai-corpus-scrutiny-report.json');
const idPrefix = process.argv.find((arg) => arg.startsWith('--id-prefix='))?.split('=')[1] || 'syn-ai-';

function recommendations(score, issues) {
    const recs = [];

    if (score.signals.role_textbox === 0 && score.signals.contenteditable === 0) {
        recs.push('Add div role=textbox contenteditable for at least one long-text answer.');
    }

    if (score.signals.combobox === 0 && score.signals.listbox === 0) {
        recs.push('Replace native select combobox with aria-haspopup listbox custom widget.');
    }

    if (score.signals.pill_buttons === 0) {
        recs.push('Use pill/button pairs for at least one yes/no screening question.');
    }

    if (score.signals.forms < 2) {
        recs.push('Add decoy newsletter/login form to test primary-form detection.');
    }

    if (score.semantic_ratio > 0.6) {
        recs.push('Reduce label-for coverage; add aria-label-only or aria-labelledby fields.');
    }

    if (issues.some((issue) => issue.code === 'layout_convergence')) {
        recs.push('Break centered card layout with table, iframe, fieldset, or split column structure.');
    }

    return recs;
}

function main() {
    const manifest = loadManifest();
    const rows = manifest.scenarios
        .filter((row) => row.id.startsWith(idPrefix))
        .sort((left, right) => left.id.localeCompare(right.id));

    const results = [];

    for (const scenario of rows) {
        const htmlPath = join(HTML_DIR, scenario.html_file || `${scenario.id}.html`);

        if (!existsSync(htmlPath)) {
            results.push({ id: scenario.id, missing_html: true });
            continue;
        }

        const html = readFileSync(htmlPath, 'utf8');
        const briefPath = join(FIXTURE_ROOT, 'briefs', `${scenario.id}.json`);
        let brief = null;

        if (existsSync(briefPath)) {
            brief = JSON.parse(readFileSync(briefPath, 'utf8'));
        }

        const mechanical = buildMechanicalReview({
            html,
            id: scenario.id,
            complexityPatterns: brief?.constraints?.required_complexity_patterns || [],
            complexityTier: brief?.constraints?.complexity_tier,
            minNonSemanticSignals: brief?.constraints?.min_non_semantic_signals,
            minComplexityScore: brief?.constraints?.min_complexity_score,
            minFields: brief?.constraints?.min_fields,
            widgets: brief?.variety?.widgets,
        });

        results.push({
            id: scenario.id,
            status: scenario.status,
            complexity_score: mechanical.complexity?.complexity_score ?? 0,
            non_semantic_signals: mechanical.complexity?.non_semantic_signals ?? 0,
            semantic_ratio: mechanical.complexity?.semantic_ratio ?? 0,
            field_count: mechanical.field_count,
            passed: mechanical.passed,
            issues: mechanical.issues,
            recommendations: recommendations(mechanical.complexity || {}, mechanical.issues),
        });
    }

    const passed = results.filter((row) => row.passed);
    const report = {
        generated_at: new Date().toISOString(),
        id_prefix: idPrefix,
        totals: {
            scenarios: results.length,
            passed: passed.length,
            failed: results.length - passed.length,
            avg_complexity: results.length === 0
                ? 0
                : Number((results.reduce((sum, row) => sum + (row.complexity_score || 0), 0) / results.length).toFixed(2)),
        },
        weakest: [...results]
            .filter((row) => !row.missing_html)
            .sort((left, right) => (left.complexity_score || 0) - (right.complexity_score || 0))
            .slice(0, 10),
        results,
    };

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
        report: REPORT_PATH,
        totals: report.totals,
        weakest: report.weakest.map((row) => ({ id: row.id, score: row.complexity_score, issues: row.issues?.length })),
    }, null, 2));
}

main();
