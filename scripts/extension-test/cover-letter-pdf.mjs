#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    buildContactLine,
    buildCoverLetterPdfBytes,
    buildCoverLetterPdfFileName,
    layoutCoverLetterLines,
} from '../../extension/src/shared/cover-letter-pdf.js';

const sampleProfile = {
    full_name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '+44 7700 900123',
    city: 'London',
};

const cases = [
    {
        name: 'builds a valid PDF header and footer',
        fn: () => {
            const bytes = buildCoverLetterPdfBytes('Dear hiring manager,\n\nI am excited to apply.');
            const pdf = new TextDecoder().decode(bytes);

            assert.match(pdf, /^%PDF-1\.4/);
            assert.match(pdf, /%%EOF/);
            assert.match(pdf, /\/Type \/Page/);
        },
    },
    {
        name: 'uses a compact monochrome letterhead',
        fn: () => {
            const pdf = new TextDecoder().decode(buildCoverLetterPdfBytes(
                'Dear hiring manager,\n\nI am excited to apply.',
                {
                    profile: sampleProfile,
                    job: { title: 'Software Engineer', company: 'Acme Ltd' },
                },
            ));

            assert.match(pdf, /\/BaseFont \/Helvetica-Bold/);
            assert.match(pdf, /\/BaseFont \/Times-Roman/);
            assert.match(pdf, /\(Alex Morgan\)/);
            assert.match(pdf, /\(alex\.morgan@example\.com \| \+44 7700 900123 \| London\)/);
            assert.doesNotMatch(pdf, /\(Re: /);
            assert.doesNotMatch(pdf, /0\.784 0\.063 0\.18 rg/);
            assert.doesNotMatch(pdf, /\/BaseFont \/Times-Italic/);
        },
    },
    {
        name: 'formats contact details with ascii separators',
        fn: () => {
            assert.equal(
                buildContactLine(sampleProfile),
                'alex.morgan@example.com | +44 7700 900123 | London',
            );
        },
    },
    {
        name: 'wraps long paragraphs',
        fn: () => {
            const longLine = 'word '.repeat(40).trim();
            const lines = layoutCoverLetterLines(longLine, 20);

            assert.ok(lines.length > 1);
            assert.ok(lines.every((line) => line.length <= 20));
        },
    },
    {
        name: 'paginates long cover letters across multiple pages',
        fn: () => {
            const text = Array.from({ length: 120 }, (_, index) => `Paragraph ${index + 1}.`).join('\n\n');
            const pdf = new TextDecoder().decode(buildCoverLetterPdfBytes(text, { profile: sampleProfile }));

            assert.match(pdf, /\/Count [2-9]/);
        },
    },
    {
        name: 'builds a descriptive download filename',
        fn: () => {
            assert.equal(
                buildCoverLetterPdfFileName({ jobTitle: 'Software Engineer', company: 'Acme Ltd' }),
                'software-engineer-acme-ltd-cover-letter.pdf',
            );
            assert.equal(buildCoverLetterPdfFileName(), 'cover-letter.pdf');
        },
    },
    {
        name: 'rejects empty cover letter text',
        fn: () => {
            assert.throws(
                () => buildCoverLetterPdfBytes('   '),
                /Nothing to download yet\./,
            );
        },
    },
];

let failed = 0;

for (const testCase of cases) {
    try {
        testCase.fn();
        console.log(`ok - ${testCase.name}`);
    } catch (error) {
        failed += 1;
        console.error(`not ok - ${testCase.name}`);
        console.error(error instanceof Error ? error.message : error);
    }
}

if (failed > 0) {
    process.exit(1);
}

console.log(`\n${cases.length} cover letter PDF checks passed.`);
