#!/usr/bin/env node
/**
 * Rebuild captured-manifest.json from HTML files in captured/.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadEnvFile, inferCaptureReason, inferStuckReasonFromSuffix } from './lib/linkedin-e2e-shared.mjs';
import { sanitizeValidationErrors } from './lib/sanitize-linkedin-capture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CAPTURED_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured');
const MANIFEST_PATH = join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured-manifest.json');
const AUTO_APPLY_SCRIPT = join(ROOT, 'extension/src/content/linkedin-auto-apply.js');
const FIELDS_SCRIPT = join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js');
const PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');

const env = { ...loadEnvFile(join(ROOT, '.env')), ...process.env };
const sanitizeOptions = {
    secrets: [env.LINKEDIN_TEST_EMAIL, env.LINKEDIN_TEST_PASSWORD].filter(Boolean),
    redactEmail: env.LINKEDIN_TEST_EMAIL?.trim() || '',
    nameParts: ['Toby Claxton', 'Toby', 'Claxton'],
};

const autoApplySource = readFileSync(AUTO_APPLY_SCRIPT, 'utf8');
const easyApplyFieldsSource = readFileSync(FIELDS_SCRIPT, 'utf8');
const parserSource = readFileSync(PARSER_SCRIPT, 'utf8');

function loadLinkedInApi(html, url = 'https://www.linkedin.com/jobs/view/1234567890/') {
    const pageUrlMatch = html.match(/<!-- page-url: ([^>]+) -->/);
    const resolvedUrl = pageUrlMatch?.[1]?.trim() || url;
    const dom = new JSDOM(html, { pretendToBeVisual: true, url: resolvedUrl });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.MouseEvent = window.MouseEvent;

    eval(parserSource);
    eval(easyApplyFieldsSource);
    eval(autoApplySource);

    return window.AutoCVApplyLinkedInAutoApply;
}

function inferSuffix(filename) {
    const base = filename.replace(/\.html$/, '');

    const stuckMatch = base.match(/-step(\d+)-stuck-([a-z0-9-]+)$/);

    if (stuckMatch) {
        return {
            suffix: `step${stuckMatch[1]}-stuck-${stuckMatch[2]}`,
            step: Number.parseInt(stuckMatch[1], 10),
            hasValidationErrors: stuckMatch[2] === 'validation',
            stuckReason: stuckMatch[2],
        };
    }

    const stepOpenMatch = base.match(/-step(\d+)-open$/);

    if (stepOpenMatch) {
        return {
            suffix: `step${stepOpenMatch[1]}-open`,
            step: Number.parseInt(stepOpenMatch[1], 10),
            hasValidationErrors: false,
        };
    }

    const stepFilledMatch = base.match(/-step(\d+)-filled$/);

    if (stepFilledMatch) {
        return {
            suffix: `step${stepFilledMatch[1]}-filled`,
            step: Number.parseInt(stepFilledMatch[1], 10),
            hasValidationErrors: false,
        };
    }

    const stepValidationMatch = base.match(/-step(\d+)-validation-errors$/);

    if (stepValidationMatch) {
        return {
            suffix: `step${stepValidationMatch[1]}-validation-errors`,
            step: Number.parseInt(stepValidationMatch[1], 10),
            hasValidationErrors: true,
        };
    }

    const stepReviewMatch = base.match(/-step(\d+)-review$/);

    if (stepReviewMatch) {
        return {
            suffix: `step${stepReviewMatch[1]}-review`,
            step: Number.parseInt(stepReviewMatch[1], 10),
            hasValidationErrors: false,
        };
    }

    if (base.endsWith('-search-results-list')) {
        return { suffix: 'search-results-list', step: null, hasValidationErrors: false, pageType: 'search-results-list' };
    }

    if (base.endsWith('-search-detail-panel')) {
        return { suffix: 'search-detail-panel', step: null, hasValidationErrors: false, pageType: 'search-detail-panel' };
    }

    if (base.endsWith('-job-view-page')) {
        return { suffix: 'job-view-page', step: null, hasValidationErrors: false, pageType: 'job-view-page' };
    }

    if (base.endsWith('-submitted')) {
        return { suffix: 'submitted', step: null, hasValidationErrors: false, submitted: true };
    }

    if (base.endsWith('-pre-submit-review')) {
        return { suffix: 'pre-submit-review', step: null, hasValidationErrors: false };
    }

    return { suffix: base.split('-').slice(-2).join('-'), step: null, hasValidationErrors: /validation-errors/.test(base) };
}

function parseTitle(html) {
    const match = html.match(/<title>([^<]+)<\/title>/i);

    if (!match) {
        return { jobTitle: 'Unknown role', company: 'Unknown company' };
    }

    const [jobTitle, company] = match[1].split(' at ');

    return {
        jobTitle: jobTitle?.trim() || 'Unknown role',
        company: company?.trim() || 'Unknown company',
    };
}

function slugFromFilename(filename) {
    return filename
        .replace(/\.html$/, '')
        .replace(/-step\d+-stuck-[a-z0-9-]+$/, '')
        .replace(/-step\d+-open$/, '')
        .replace(/-step\d+-validation-errors$/, '')
        .replace(/-step\d+-filled$/, '')
        .replace(/-search-results-list$/, '')
        .replace(/-search-detail-panel$/, '')
        .replace(/-job-view-page$/, '')
        .replace(/-submitted$/, '')
        .replace(/-pre-submit-review$/, '')
        .replace(/-step\d+-review$/, '');
}

const files = readdirSync(CAPTURED_DIR).filter((name) => name.endsWith('.html')).sort();
const scenarios = [];

for (const file of files) {
    const html = readFileSync(join(CAPTURED_DIR, file), 'utf8');
    const api = loadLinkedInApi(html);
    const modal = api.readEasyApplyModal();
    const state = modal ? api.getEasyApplyModalState() : {};
    const errors = modal ? api.readEasyApplyModalErrors() : [];
    const submitted = api.verifySubmitted();
    const meta = inferSuffix(file);
    const { jobTitle, company } = parseTitle(html);
    const slug = slugFromFilename(file);
    const capturedAtMatch = html.match(/<!-- captured-at: ([^>]+) -->/);
    const roleSearchMatch = html.match(/<!-- role-search: ([^>]+) -->/);
    const pageUrlMatch = html.match(/<!-- page-url: ([^>]+) -->/);
    const pageTypeMatch = html.match(/<!-- page-type: ([^>]+) -->/);
    const pageType = meta.pageType || pageTypeMatch?.[1]?.trim() || null;
    const expectsModal = !pageType;
    const diagnoseFile = file.replace(/\.html$/, '.diagnose.json');
    const diagnosePath = join(CAPTURED_DIR, diagnoseFile);
    const hasDiagnoseFile = existsSync(diagnosePath);
    const hasHtmlErrorMarkers = /artdeco-inline-feedback--error|data-test-form-element-error|fb-dash-form-element__error-field/.test(html);

    const stuckReason = meta.stuckReason || inferStuckReasonFromSuffix(meta.suffix);
    const captureReason = inferCaptureReason({
        suffix: meta.suffix,
        hasValidationErrors: meta.hasValidationErrors || hasHtmlErrorMarkers,
        stuckReason,
        primaryAction: state.action,
        stepNumber: meta.step,
    });

    scenarios.push({
        id: `captured-${file.replace(/\.html$/, '')}`,
        file,
        source: 'live-capture',
        flow_id: slug,
        job_id: slug.match(/(\d{6,})$/)?.[1] || null,
        job_title: jobTitle,
        company,
        role_search: roleSearchMatch?.[1]?.trim() || null,
        step: meta.step,
        step_label: state.stepLabel,
        step_fingerprint: api.readStepFingerprint(),
        capture_reason: pageType || captureReason,
        page_type: pageType,
        page_url: pageUrlMatch?.[1]?.trim() || null,
        stuck_reason: stuckReason,
        has_validation_errors: meta.hasValidationErrors || hasHtmlErrorMarkers,
        expects_validation_errors: meta.hasValidationErrors || hasHtmlErrorMarkers,
        expected_errors: sanitizeValidationErrors(errors.slice(0, 3), sanitizeOptions),
        primary_action: state.action || null,
        action_disabled: state.actionDisabled || false,
        expects_submitted: Boolean(meta.submitted || submitted.submitted),
        expects_modal: expectsModal,
        captured_at: capturedAtMatch?.[1] || null,
        diagnose_file: hasDiagnoseFile ? diagnoseFile : null,
        notes: `Live capture ${meta.suffix} for ${jobTitle} at ${company}.`,
    });
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify({ scenarios, captured_at: new Date().toISOString() }, null, 2)}\n`);
console.log(`Rebuilt manifest with ${scenarios.length} scenario(s).`);
