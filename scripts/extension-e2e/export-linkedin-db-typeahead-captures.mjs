#!/usr/bin/env node
/**
 * Export LinkedIn Easy Apply typeahead captures from extension_page_captures.
 *
 * Queries PostgreSQL (via Sail) for modal HTML containing location/entity typeaheads,
 * extracts the Easy Apply modal fragment, redacts PII, and writes fixtures under
 * tests/fixtures/auto-apply/linkedin/db-export/.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadEnvFile, slugify } from './lib/linkedin-e2e-shared.mjs';
import {
    appendCaptureMetaComments,
    sanitizeLinkedInCaptureHtml,
    wrapModalCaptureHtml,
} from './lib/sanitize-linkedin-capture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin/db-export');
const MANIFEST_PATH = join(ROOT, 'tests/fixtures/auto-apply/linkedin/db-export-manifest.json');
const LARAVEL_CONTAINER = process.env.SAIL_CONTAINER || 'autocvapply-laravel.test-1';

const env = { ...loadEnvFile(join(ROOT, '.env')), ...process.env };
const sanitizeOptions = {
    secrets: [env.LINKEDIN_TEST_EMAIL, env.LINKEDIN_TEST_PASSWORD].filter(Boolean),
    redactEmail: env.LINKEDIN_TEST_EMAIL?.trim() || '',
    nameParts: ['Toby Claxton', 'Toby', 'Claxton'],
};

function runPhp(queryPhp) {
    const escaped = queryPhp.replace(/'/g, `'\\''`);

    return execSync(
        `/opt/homebrew/bin/docker exec ${LARAVEL_CONTAINER} php artisan tinker --execute '${escaped}'`,
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
}

function fetchTypeaheadCaptures() {
    const output = runPhp(`
$captures = \\App\\Models\\ExtensionPageCapture::query()
    ->where(fn ($q) => $q->where('platform', 'linkedin')->orWhere('url', 'like', '%linkedin.com%'))
    ->where('html', 'like', '%jobs-easy-apply-modal%')
    ->where('html', 'like', '%location-GEO-LOCATION%')
    ->orderByDesc('id')
    ->get(['id', 'url', 'page_title', 'platform', 'created_at', 'html']);

$rows = [];
foreach ($captures as $capture) {
    preg_match('/easyApplyFormElement-(\\d+)-/', $capture->html, $jobMatch);
    preg_match('/input[^>]*id=\\"[^\\"]*location-GEO-LOCATION\\"[^>]*value=\\"([^\\"]*)\\"/', $capture->html, $valueMatch);
    $hasValidationError = str_contains($capture->html, 'location-GEO-LOCATION-error')
        && str_contains($capture->html, 'Please enter a valid answer');
    $rows[] = [
        'id' => $capture->id,
        'url' => $capture->url,
        'page_title' => $capture->page_title,
        'platform' => $capture->platform,
        'created_at' => $capture->created_at?->toIso8601String(),
        'job_id' => $jobMatch[1] ?? null,
        'location_value' => $valueMatch[1] ?? '',
        'has_validation_error' => $hasValidationError,
        'html' => $capture->html,
    ];
}

echo json_encode($rows, JSON_UNESCAPED_SLASHES);
`);

    const jsonStart = output.indexOf('[');
    const jsonEnd = output.lastIndexOf(']');

    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error(`Could not parse tinker JSON output:\n${output.slice(0, 500)}`);
    }

    return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
}

function extractModalHtml(fullHtml) {
    const dom = new JSDOM(fullHtml);
    const modal = dom.window.document.querySelector(
        '.jobs-easy-apply-modal, [data-test-modal], div[role="dialog"] .jobs-easy-apply-content',
    )?.closest('.jobs-easy-apply-modal, [data-test-modal], div[role="dialog"]');

    return modal?.outerHTML || null;
}

function buildFilename(capture) {
    const slug = slugify(`db-capture-${capture.id}-job-${capture.job_id || 'unknown'}-location-typeahead`);

    return `${slug}-step1-open.html`;
}

function buildScenario(capture, filename) {
    return {
        id: `db-export-${capture.id}-location-typeahead`,
        file: filename,
        source: 'db-export',
        extension_page_capture_id: capture.id,
        flow_id: `db-capture-${capture.id}-job-${capture.job_id || 'unknown'}`,
        job_id: capture.job_id,
        job_title: capture.page_title?.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim() || null,
        company: null,
        step: 1,
        step_label: 'Contact info',
        capture_reason: capture.has_validation_error ? 'validation-errors' : 'open',
        page_url: capture.url,
        typeahead_kind: 'location-geo',
        typeahead_label: 'Location (city)',
        expects_modal: true,
        expects_validation_errors: capture.has_validation_error,
        captured_at: capture.created_at,
        notes: `DB export from extension_page_captures.id=${capture.id} (${capture.url}).`,
    };
}

function main() {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const captures = fetchTypeaheadCaptures();

    if (captures.length === 0) {
        throw new Error('No LinkedIn location typeahead captures found in extension_page_captures.');
    }

    const scenarios = [];

    for (const capture of captures) {
        const modalHtml = extractModalHtml(capture.html);

        if (!modalHtml) {
            console.warn(`skip capture ${capture.id}: Easy Apply modal not found`);

            continue;
        }

        const filename = buildFilename(capture);
        const wrapped = wrapModalCaptureHtml(modalHtml, {
            jobTitle: capture.page_title,
            pageUrl: capture.url,
        });
        const sanitized = appendCaptureMetaComments(
            sanitizeLinkedInCaptureHtml(wrapped, sanitizeOptions),
            {
                capturedAt: capture.created_at || new Date().toISOString(),
                pageUrl: capture.url,
            },
        );

        writeFileSync(join(OUTPUT_DIR, filename), sanitized);

        scenarios.push(buildScenario(capture, filename));
        console.log(`exported capture ${capture.id} -> db-export/${filename}`);
    }

    writeFileSync(MANIFEST_PATH, `${JSON.stringify({
        exported_at: new Date().toISOString(),
        query: {
            platform: 'linkedin OR url LIKE %linkedin.com%',
            html_patterns: [
                'jobs-easy-apply-modal',
                'location-GEO-LOCATION',
            ],
        },
        scenarios,
    }, null, 2)}\n`);

    console.log(`\nWrote ${scenarios.length} fixture(s) to ${OUTPUT_DIR}`);
    console.log(`Manifest: ${MANIFEST_PATH}`);
}

main();
