#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    fillApplicationDocumentsSequence,
    normalizeCoverLetterJobPayload,
    resolveCoverLetterAttachPayload,
    shouldFillApplicationDocumentsDuringDraftAll,
} from '../../extension/src/shared/cover-letter-attach.js';

test('Draft All always attaches application documents (including under Auto Apply)', () => {
    assert.equal(shouldFillApplicationDocumentsDuringDraftAll(), true);
});

test('normalizeCoverLetterJobPayload maps job_description to description', () => {
    const normalized = normalizeCoverLetterJobPayload({
        title: 'Engineer',
        company: 'Ripple',
        job_description: 'A'.repeat(50),
        link: 'https://example.com/job',
    });

    assert.equal(normalized.description.length, 50);
    assert.equal(normalized.job_description.length, 50);
});

test('document sequence waits after resume before cover letter', async () => {
    const calls = [];
    const sleeps = [];

    await fillApplicationDocumentsSequence({
        fillResume: async () => {
            calls.push('resume');
        },
        fillCoverLetter: async () => {
            calls.push('cover');
        },
        waitMs: 40,
        sleep: async (ms) => {
            sleeps.push(ms);
            calls.push(`wait:${ms}`);
        },
    });

    assert.deepEqual(calls, ['resume', 'wait:40', 'cover']);
    assert.deepEqual(sleeps, [40]);
});

test('resolveCoverLetterAttachPayload prefers assist saved document (Cover tab path)', async () => {
    const payload = await resolveCoverLetterAttachPayload({
        job: {
            title: 'Engineer',
            company: 'Ripple',
            link: 'https://example.com/job',
            job_description: 'C'.repeat(50),
        },
        generate: true,
        assistCoverLetter: async () => ({
            success: true,
            cover_letter: 'Dear Hiring Manager,\n\nI am applying to Ripple.\n',
            saved_document: { id: 42 },
        }),
        downloadProfileDocument: async (id) => {
            assert.equal(id, 42);

            return {
                base64: 'AAAA',
                fileName: 'Cover-Letter-Ripple.pdf',
                mimeType: 'application/pdf',
            };
        },
        getProfile: async () => {
            throw new Error(
                'should not build client PDF when saved document exists',
            );
        },
        buildCoverLetterPdfBytes: () => {
            throw new Error(
                'should not build client PDF when saved document exists',
            );
        },
        arrayBufferToBase64: () => 'nope',
    });

    assert.equal(payload.source, 'assist_saved_document');
    assert.equal(payload.fileName, 'Cover-Letter-Ripple.pdf');
    assert.match(payload.base64, /^data:application\/pdf;base64,AAAA$/);
});

test('resolveCoverLetterAttachPayload falls back to draft template + styled PDF', async () => {
    const profile = {
        full_name: 'Alex Morgan',
        cover_letter_design: 'ink-sidebar',
        cover_letter_font: 'literata',
        experience: [],
    };
    let builtText = null;
    let assistJob = null;

    const payload = await resolveCoverLetterAttachPayload({
        job: {
            title: 'Engineer',
            company: 'Ripple',
            job_description: 'B'.repeat(45),
        },
        generate: true,
        assistCoverLetter: async ({ job }) => {
            assistJob = job;
            throw new Error('assist unavailable');
        },
        getProfile: async () => profile,
        buildDraftCoverLetterText: (profileData, job) => {
            builtText = `template for ${job.company}`;

            return builtText;
        },
        buildCoverLetterPdfBytes: (text, options) => {
            assert.equal(text, builtText);
            assert.equal(options.design, 'ink-sidebar');
            assert.equal(options.font, 'literata');

            return new Uint8Array([1, 2, 3]);
        },
        buildCoverLetterPdfFileName: () => 'cover-letter.pdf',
        arrayBufferToBase64: (bytes) => {
            assert.equal(bytes.length, 3);

            return 'AQID';
        },
    });

    assert.equal(assistJob?.description?.length, 45);
    assert.match(payload.source, /assist_failed/);
    assert.match(payload.source, /draft_template/);
    assert.equal(payload.design, 'ink-sidebar');
    assert.equal(payload.font, 'literata');
    assert.match(payload.base64, /AQID$/);
});

test('provided text skips assist generation', async () => {
    let assistCalled = false;

    const payload = await resolveCoverLetterAttachPayload({
        job: { title: 'Engineer', company: 'Ripple' },
        text: 'Dear Hiring Manager,\n\nCustom letter.\n',
        generate: false,
        assistCoverLetter: async () => {
            assistCalled = true;

            return { cover_letter: 'should not use' };
        },
        getProfile: async () => ({
            full_name: 'Alex',
            cover_letter_design: 'teal-masthead',
            cover_letter_font: 'clash-display',
        }),
        buildCoverLetterPdfBytes: () => new Uint8Array([9]),
        buildCoverLetterPdfFileName: () => 'cover-letter.pdf',
        arrayBufferToBase64: () => 'CQ==',
    });

    assert.equal(assistCalled, false);
    assert.equal(payload.source, 'provided_text');
});
