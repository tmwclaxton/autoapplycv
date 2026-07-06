#!/usr/bin/env node
/**
 * Re-sanitize captured LinkedIn HTML and manifest after capture rule updates.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/linkedin-e2e-shared.mjs';
import { sanitizeLinkedInCaptureHtml, sanitizeValidationErrors } from './lib/sanitize-linkedin-capture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CAPTURED_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured');
const MANIFEST_PATH = join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured-manifest.json');

const env = { ...loadEnvFile(join(ROOT, '.env')), ...process.env };
const email = env.LINKEDIN_TEST_EMAIL?.trim() || '';
const password = env.LINKEDIN_TEST_PASSWORD?.trim() || '';

const sanitizeOptions = {
    secrets: [email, password].filter(Boolean),
    redactEmail: email,
    nameParts: ['Toby Claxton', 'Toby', 'Claxton'],
    extraEmails: [],
    phoneNumbers: [],
};

for (const filename of readdirSync(CAPTURED_DIR).filter((name) => name.endsWith('.html'))) {
    const path = join(CAPTURED_DIR, filename);
    const html = readFileSync(path, 'utf8');
    writeFileSync(path, sanitizeLinkedInCaptureHtml(html, sanitizeOptions));
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

for (const scenario of manifest.scenarios || []) {
    scenario.expected_errors = sanitizeValidationErrors(scenario.expected_errors || [], sanitizeOptions);
    scenario.job_title = scenario.job_title?.replace(/Toby Claxton/g, 'Alex Candidate');
    scenario.notes = scenario.notes?.replace(/Toby Claxton/g, 'Alex Candidate');
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Re-sanitized ${readdirSync(CAPTURED_DIR).filter((name) => name.endsWith('.html')).length} HTML file(s) and manifest.`);
