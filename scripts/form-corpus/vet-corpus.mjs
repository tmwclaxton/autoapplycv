#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { normalizeQuestion, questionsMatch, normalizeOptions, domReferenceKey } from './lib/normalize.mjs';
import { EXPECTED_DIR, HTML_DIR, VET_REPORT_PATH } from './lib/paths.mjs';
import { buildSnapshotFromFile } from './lib/snapshot-runner.mjs';

const manifest = loadManifest();
const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const idPrefixArg = process.argv.find((arg) => arg.startsWith('--id-prefix='))?.split('=')[1];
const pendingOnly = process.argv.includes('--pending-only');
const reportOnly = process.argv.includes('--report-only');
const slimReport = process.argv.includes('--slim-report');
const report = {
    vetted_at: new Date().toISOString(),
    totals: { scenarios: 0, vetted: 0, rejected: 0, pending: 0 },
    vetted: [],
    rejected: [],
};

function matchesFilter(scenario) {
    if (idArg && scenario.id !== idArg) {
        return false;
    }

    if (idPrefixArg && !scenario.id.startsWith(idPrefixArg)) {
        return false;
    }

    if (pendingOnly && (scenario.status ?? '') === 'vetted') {
        return false;
    }

    return true;
}

function findMatchingField(expectedField, actualFields, usedIndices = new Set()) {
    const expectedDomKey = domReferenceKey(expectedField.dom, expectedField.field_type);

    if (expectedDomKey) {
        for (const [index, actual] of actualFields.entries()) {
            if (usedIndices.has(index)) {
                continue;
            }

            const actualDomKey = domReferenceKey(actual.dom, actual.field_type);

            if (actualDomKey && actualDomKey === expectedDomKey) {
                usedIndices.add(index);

                return actual;
            }
        }
    }

    for (const [index, actual] of actualFields.entries()) {
        if (usedIndices.has(index)) {
            continue;
        }

        if (normalizeQuestion(expectedField.question) === normalizeQuestion(actual.question)) {
            usedIndices.add(index);

            return actual;
        }
    }

    for (const [index, actual] of actualFields.entries()) {
        if (usedIndices.has(index)) {
            continue;
        }

        if (questionsMatch(expectedField.question, actual.question)) {
            usedIndices.add(index);

            return actual;
        }
    }

    return null;
}

function vetScenario(scenario) {
    const issues = [];
    const htmlPath = join(HTML_DIR, scenario.html_file);
    const expectedPath = join(EXPECTED_DIR, `${scenario.id}.json`);

    if (!existsSync(htmlPath)) {
        return { status: 'rejected', issues: ['Missing HTML fixture.'] };
    }

    if (!existsSync(expectedPath)) {
        return { status: 'rejected', issues: ['Missing expected JSON — run propose-expectations.mjs.'] };
    }

    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
    const snapshot = buildSnapshotFromFile(
        htmlPath,
        scenario.page_url || `https://example.test/forms/${scenario.id}`,
        scenario.page_title || 'Job Application',
        scenario.interaction_steps || [],
    );

    const actualFields = snapshot.elements.map((element) => ({
        question: normalizeQuestion(element.question),
        field_type: element.field_type,
        max_chars: element.max_chars ?? null,
        options: normalizeOptions(element.options),
        required: element.required ?? false,
        dom: element.dom ?? null,
    }));
    const usedIndices = new Set();

    const minFields = expected.min_fields ?? expected.fields?.length ?? 0;

    if (actualFields.length < minFields) {
        issues.push(`Expected at least ${minFields} fields but snapshot has ${actualFields.length}.`);
    }

    if ((expected.exact_field_count ?? null) !== null && actualFields.length !== expected.exact_field_count) {
        issues.push(`Expected exactly ${expected.exact_field_count} fields but snapshot has ${actualFields.length}.`);
    }

    for (const expectedField of expected.fields || []) {
        const actual = findMatchingField(expectedField, actualFields, usedIndices);

        if (!actual) {
            issues.push(`Missing expected field: "${expectedField.question}".`);
            continue;
        }

        if (expectedField.field_type && actual.field_type !== expectedField.field_type) {
            issues.push(`Field "${expectedField.question}" type mismatch: expected ${expectedField.field_type}, got ${actual.field_type}.`);
        }

        if (expectedField.max_chars && actual.max_chars !== expectedField.max_chars) {
            issues.push(`Field "${expectedField.question}" max_chars mismatch: expected ${expectedField.max_chars}, got ${actual.max_chars}.`);
        }

        if (expectedField.options) {
            const expectedOpts = (expectedField.options || []).map(normalizeQuestion);
            const actualOpts = (actual.options || []).map(normalizeQuestion);

            if (expectedOpts.length !== actualOpts.length) {
                issues.push(`Field "${expectedField.question}" option count mismatch.`);
            }
        }
    }

    for (const field of actualFields) {
        if (field.question.length < 3) {
            issues.push(`Actual field label too short: "${field.question}".`);
        }
    }

    const duplicateQuestions = new Set();
    const seen = new Set();

    for (const field of actualFields) {
        if (seen.has(field.question)) {
            duplicateQuestions.add(field.question);
        }

        seen.add(field.question);
    }

    for (const duplicate of duplicateQuestions) {
        issues.push(`Duplicate normalized question: "${duplicate}".`);
    }

    if (/upload cv|resume|curriculum vitae/i.test(JSON.stringify(actualFields)) && actualFields.some((field) => /upload cv|resume file/i.test(field.question))) {
        issues.push('File upload field should not appear in draftable inventory.');
    }

    if (issues.length === 0) {
        return { status: 'vetted', issues: [] };
    }

    return { status: scenario.source === 'synthetic' ? 'rejected' : 'pending', issues };
}

if (! reportOnly) {
    const updates = new Map();

    for (const scenario of manifest.scenarios) {
        if (! matchesFilter(scenario)) {
            continue;
        }

        const result = vetScenario(scenario);
        updates.set(scenario.id, {
            status: result.status,
            vet_issues: result.issues,
        });
    }

    const freshManifest = loadManifest();

    for (const scenario of freshManifest.scenarios) {
        const patch = updates.get(scenario.id);

        if (patch) {
            scenario.status = patch.status;
            scenario.vet_issues = patch.vet_issues;
        }
    }

    saveManifest(freshManifest);
    Object.assign(manifest, freshManifest);

    if (idArg) {
        process.exit(0);
    }
}

report.totals = { scenarios: 0, vetted: 0, rejected: 0, pending: 0 };
report.vetted = [];
report.rejected = [];

for (const scenario of manifest.scenarios) {
    report.totals.scenarios += 1;

    if ((scenario.status ?? '') === 'vetted') {
        report.totals.vetted += 1;

        if (! slimReport || report.vetted.length < 50) {
            report.vetted.push({ id: scenario.id, category: scenario.category, field_count: scenario.field_count });
        }
    } else if ((scenario.status ?? '') === 'rejected') {
        report.totals.rejected += 1;

        if (! slimReport || report.rejected.length < 100) {
            report.rejected.push({ id: scenario.id, category: scenario.category, issues: scenario.vet_issues ?? [] });
        }
    } else {
        report.totals.pending += 1;
    }
}

writeFileSync(VET_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Vet complete: ${report.totals.vetted} vetted, ${report.totals.rejected} rejected, ${report.totals.pending} pending.`);
console.log(`Report: ${VET_REPORT_PATH}`);

if (report.rejected.length > 0) {
    console.log('\nRejected sample:');
    report.rejected.slice(0, 10).forEach((row) => {
        console.log(`- ${row.id}: ${row.issues.join(' | ')}`);
    });
}
