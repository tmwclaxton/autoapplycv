import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    buildMechanicalSummary,
    buildScrutinyPayload,
    buildTextSignals,
    normalizeScrutinyResult,
    scrutinizeFirecrawlPage,
    truncateHtmlForScrutiny,
} from './lib/firecrawl-page-scrutiny.mjs';

test('truncateHtmlForScrutiny centers excerpt on form markup', () => {
    const padding = 'x'.repeat(20_000);
    const html = `${padding}<form><input name="email"></form>${padding}`;
    const excerpt = truncateHtmlForScrutiny(html, 5000);

    assert.match(excerpt, /<form/i);
    assert.ok(excerpt.length <= 5000);
});

test('buildMechanicalSummary captures field inventory', () => {
    const summary = buildMechanicalSummary({
        elements: [
            { question: 'Full name', field_type: 'text', required: true },
            { question: 'Email', field_type: 'email', required: true },
        ],
    });

    assert.equal(summary.field_count, 2);
    assert.deepEqual(summary.field_types, ['text', 'email']);
    assert.equal(summary.fields[0].question, 'Full name');
});

test('buildTextSignals flags template/blog language', () => {
    const signals = buildTextSignals('<title>Job application form template</title><p>Subscribe to our newsletter</p>');

    assert.equal(signals.mentions_blog_or_template, true);
    assert.equal(signals.mentions_apply, true);
});

test('normalizeScrutinyResult enforces schema', () => {
    const normalized = normalizeScrutinyResult({
        accept: true,
        reason: 'Real apply form',
        confidence: 1.4,
        issues: ['resume upload', '', 42],
    });

    assert.equal(normalized.accept, true);
    assert.equal(normalized.confidence, 1);
    assert.deepEqual(normalized.issues, ['resume upload']);
});

test('buildScrutinyPayload bundles url, excerpt, and mechanical summary', () => {
    const payload = buildScrutinyPayload({
        url: 'https://jobs.example.com/apply',
        pageTitle: 'Apply now',
        html: '<form><label>Email</label><input type="email" name="email"></form>',
        snapshot: {
            elements: [{ question: 'Email', field_type: 'email', required: true }],
        },
    });

    assert.equal(payload.url, 'https://jobs.example.com/apply');
    assert.match(payload.html_excerpt, /<form/i);
    assert.equal(payload.mechanical.field_count, 1);
    assert.equal(payload.text_signals.has_form_tag, true);
});

test('scrutinizeFirecrawlPage uses injected scrutinizeFn without PHP', () => {
    const dir = mkdtempSync(join(tmpdir(), 'firecrawl-scrutiny-'));
    const cachePath = join(dir, 'cache.json');
    const originalCachePath = process.env.FORM_CORPUS_SCRUTINY_CACHE_PATH;

    process.env.FORM_CORPUS_SCRUTINY_CACHE_PATH = cachePath;

    try {
        const result = scrutinizeFirecrawlPage({
            url: 'https://jobs.example.com/apply',
            html: '<form><input name="name"><input name="email" type="email"></form>',
            snapshot: {
                elements: [
                    { question: 'Name', field_type: 'text' },
                    { question: 'Email', field_type: 'email' },
                ],
            },
            scrutinizeFn: () => ({
                accept: false,
                reason: 'Newsletter decoy',
                confidence: 0.9,
                issues: ['newsletter'],
            }),
        });

        assert.equal(result.accept, false);
        assert.equal(result.reason, 'Newsletter decoy');
        assert.equal(result.from_cache, false);

        const cached = scrutinizeFirecrawlPage({
            url: 'https://jobs.example.com/apply',
            html: '<form></form>',
            snapshot: { elements: [] },
            scrutinizeFn: () => ({
                accept: true,
                reason: 'Should not be called',
                confidence: 1,
                issues: [],
            }),
        });

        assert.equal(cached.from_cache, true);
        assert.equal(cached.accept, false);
        assert.ok(readFileSync(cachePath, 'utf8').includes('Newsletter decoy'));
    } finally {
        if (originalCachePath === undefined) {
            delete process.env.FORM_CORPUS_SCRUTINY_CACHE_PATH;
        } else {
            process.env.FORM_CORPUS_SCRUTINY_CACHE_PATH = originalCachePath;
        }

        rmSync(dir, { recursive: true, force: true });
    }
});
