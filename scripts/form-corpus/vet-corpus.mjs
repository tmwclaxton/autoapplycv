#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { normalizeQuestion, questionsMatch, normalizeOptions } from './lib/normalize.mjs';
import { buildSnapshotFromFile } from './lib/snapshot-runner.mjs';
import { EXPECTED_DIR, HTML_DIR, VET_REPORT_PATH } from './lib/paths.mjs';

const manifest = loadManifest();
const report = {
    vetted_at: new Date().toISOString(),
    totals: { scenarios: 0, vetted: 0, rejected: 0, pending: 0 },
    vetted: [],
    rejected: [],
};

function findMatchingField(expectedField, actualFields) {
    for (const actual of actualFields) {
        if (questionsMatch(expectedField.question, actual.question)) {
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
    );

    const actualFields = snapshot.elements.map((element) => ({
        question: normalizeQuestion(element.question),
        field_type: element.field_type,
        max_chars: element.max_chars ?? null,
        options: normalizeOptions(element.options),
        required: element.required ?? false,
    }));

    const minFields = expected.min_fields ?? expected.fields?.length ?? 0;

    if (actualFields.length < minFields) {
        issues.push(`Expected at least ${minFields} fields but snapshot has ${actualFields.length}.`);
    }

    if ((expected.exact_field_count ?? null) !== null && actualFields.length !== expected.exact_field_count) {
        issues.push(`Expected exactly ${expected.exact_field_count} fields but snapshot has ${actualFields.length}.`);
    }

    for (const expectedField of expected.fields || []) {
        const actual = findMatchingField(expectedField, actualFields);

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

for (const scenario of manifest.scenarios) {
    report.totals.scenarios += 1;
    const result = vetScenario(scenario);
    scenario.status = result.status;
    scenario.vet_issues = result.issues;

    if (result.status === 'vetted') {
        report.totals.vetted += 1;
        report.vetted.push({ id: scenario.id, category: scenario.category, field_count: scenario.field_count });
    } else if (result.status === 'rejected') {
        report.totals.rejected += 1;
        report.rejected.push({ id: scenario.id, category: scenario.category, issues: result.issues });
    } else {
        report.totals.pending += 1;
    }
}

saveManifest(manifest);
writeFileSync(VET_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Vet complete: ${report.totals.vetted} vetted, ${report.totals.rejected} rejected, ${report.totals.pending} pending.`);
console.log(`Report: ${VET_REPORT_PATH}`);

if (report.rejected.length > 0) {
    console.log('\nRejected sample:');
    report.rejected.slice(0, 10).forEach((row) => {
        console.log(`- ${row.id}: ${row.issues.join(' | ')}`);
    });
}
