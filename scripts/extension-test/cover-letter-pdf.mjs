#!/usr/bin/env node
import assert from 'node:assert/strict';
import { measurePdfRenderedWidth, measurePdfTextWidth } from '../../extension/src/shared/cover-letter-pdf-metrics.js';
import {
    buildContactLine,
    buildCoverLetterPdfBytes,
    buildCoverLetterPdfFileName,
    estimateTextWidth,
    hrefForContactValue,
    layoutCoverLetterLines,
    stripLeadingCoverLetterLetterhead,
} from '../../extension/src/shared/cover-letter-pdf.js';

function parsePdfTextOps(pdf) {
    const ops = [];
    const re = /(?:([0-9.]+) Tw\n)?BT\n([0-9.]+) ([0-9.]+) ([0-9.]+) rg\n(F\d+) ([0-9.]+) Tf\n([0-9.]+) ([0-9.]+) Td\n\(([^)]*)\) Tj\nET(?:\n0 Tw)?/g;
    let match;

    while ((match = re.exec(pdf)) !== null) {
        ops.push({
            tw: match[1] != null ? Number(match[1]) : 0,
            font: match[5],
            size: Number(match[6]),
            x: Number(match[7]),
            y: Number(match[8]),
            text: match[9]
                .replace(/\\([\\()])/g, '$1'),
        });
    }

    return ops;
}

function metricsKeyForFont(font, serif) {
    if (font === 'F1') {
        return serif ? 'times-bold' : 'helvetica-bold';
    }

    return serif ? 'times-roman' : 'helvetica';
}

function contentBoundsForDesign(design) {
    if (design === 'ink-sidebar') {
        return {
            mainLeft: 178,
            mainRight: 540,
            sideLeft: 18,
            sideRight: 132,
        };
    }

    if (design === 'forest-rail') {
        return { mainLeft: 56, mainRight: 540, sideLeft: null, sideRight: null };
    }

    if (design === 'geometric-mark') {
        return { mainLeft: 124, mainRight: 540, sideLeft: null, sideRight: null };
    }

    return { mainLeft: 72, mainRight: 540, sideLeft: null, sideRight: null };
}

const sampleProfile = {
    full_name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '+44 7700 900123',
    city: 'London',
    linkedin_url: 'linkedin.com/in/alexmorgan',
    website_url: 'alexmorgan.dev',
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
            assert.match(pdf, /\/BaseFont \/Helvetica/);
            assert.match(pdf, /\(Alex Morgan\)/);
            assert.match(pdf, /alex\.morgan@example\.com \| \+44 7700 900123 \| London/);
            assert.match(pdf, /linkedin\.com\/in\/alexmorgan/);
            assert.match(pdf, /alexmorgan\.dev/);
            assert.doesNotMatch(pdf, /\(Re: /);
            assert.doesNotMatch(pdf, /0\.784 0\.063 0\.18 rg/);
            assert.doesNotMatch(pdf, /\/BaseFont \/Times-Italic/);
            assert.match(pdf, /CoverLetterDesign \(teal-masthead\)/);
        },
    },
    {
        name: 'applies profile cover_letter_design and cover_letter_font',
        fn: () => {
            const pdf = new TextDecoder('latin1').decode(buildCoverLetterPdfBytes(
                'Dear hiring manager,\n\nI am excited to apply.',
                {
                    profile: {
                        ...sampleProfile,
                        cover_letter_design: 'ink-sidebar',
                        cover_letter_font: 'literata',
                    },
                    job: { title: 'Software Engineer', company: 'Acme Ltd' },
                },
            ));

            assert.match(pdf, /CoverLetterDesign \(ink-sidebar\)/);
            assert.match(pdf, /CoverLetterFont \(literata\)/);
            assert.match(pdf, /\/BaseFont \/Times-Bold/);
            assert.match(pdf, /\/BaseFont \/Times-Roman/);
            assert.match(pdf, /0\.11(?:0)? 0\.122 0\.149 rg/);
        },
    },
    {
        name: 'honours explicit design/font over profile defaults',
        fn: () => {
            const pdf = new TextDecoder('latin1').decode(buildCoverLetterPdfBytes(
                'Dear hiring manager,\n\nI am excited to apply.',
                {
                    profile: {
                        ...sampleProfile,
                        cover_letter_design: 'ink-sidebar',
                        cover_letter_font: 'literata',
                    },
                    design: 'coral-timeline',
                    font: 'clash-display',
                },
            ));

            assert.match(pdf, /CoverLetterDesign \(coral-timeline\)/);
            assert.match(pdf, /CoverLetterFont \(clash-display\)/);
            assert.match(pdf, /\/BaseFont \/Helvetica-Bold/);
            assert.match(pdf, /0\.878 0\.416 0\.306 rg/);
        },
    },
    {
        name: 'formats contact details with ascii separators',
        fn: () => {
            assert.equal(
                buildContactLine(sampleProfile),
                'alex.morgan@example.com | +44 7700 900123 | London | linkedin.com/in/alexmorgan | alexmorgan.dev',
            );
            assert.equal(hrefForContactValue('alex.morgan@example.com'), 'mailto:alex.morgan@example.com');
            assert.equal(hrefForContactValue('+44 7700 900123'), 'tel:+447700900123');
            assert.equal(hrefForContactValue('linkedin.com/in/alexmorgan'), 'https://linkedin.com/in/alexmorgan');
        },
    },
    {
        name: 'wraps long paragraphs by measured width',
        fn: () => {
            const longLine = 'word '.repeat(40).trim();
            const maxWidth = 120;
            const lines = layoutCoverLetterLines(longLine, maxWidth, 11.5, 'helvetica');

            assert.ok(lines.length > 1);
            assert.ok(lines.every((line) => measurePdfTextWidth(line, 11.5, 'helvetica') <= maxWidth + 0.01));
        },
    },
    {
        name: 'breaks long unbreakable tokens mid-token',
        fn: () => {
            const token = `https://example.com/${'supercalifragilisticexpialidocious'.repeat(4)}/path`;
            const maxWidth = 160;
            const lines = layoutCoverLetterLines(token, maxWidth, 11.5, 'helvetica');

            assert.ok(lines.length > 1);
            assert.ok(lines.every((line) => measurePdfTextWidth(line, 11.5, 'helvetica') <= maxWidth + 0.01));
        },
    },
    {
        name: 'justifies wrapped body paragraph lines',
        fn: () => {
            const body = Array.from(
                { length: 28 },
                () => 'This experience demonstrates strong delivery across complex product work',
            ).join(' ') + '.';
            const pdf = new TextDecoder().decode(buildCoverLetterPdfBytes(
                `Dear Hiring Manager,\n\n${body}\n\nYours faithfully,\nAlex Morgan`,
                {
                    design: 'teal-masthead',
                    profile: sampleProfile,
                },
            ));

            assert.match(pdf, /\d+\.\d+ Tw/);
            assert.match(pdf, /0 Tw/);
            assert.match(pdf, /Dear Hiring Manager,/);
            assert.match(pdf, /Yours faithfully,/);

            const ops = parsePdfTextOps(pdf).filter((op) => op.tw > 0 && op.size === 11.5);
            assert.ok(ops.length > 0);

            const maxWidth = 612 - 72 - 72;
            let reachedEdge = false;
            let sampleTw = null;

            for (const op of ops) {
                const visualWidth = measurePdfRenderedWidth(op.text, op.size, 'helvetica', op.tw);
                sampleTw ??= { tw: op.tw, visualWidth, maxWidth, text: op.text.slice(0, 60) };

                if (visualWidth >= maxWidth * 0.995 && visualWidth <= maxWidth + 0.05) {
                    reachedEdge = true;
                    break;
                }
            }

            assert.equal(
                reachedEdge,
                true,
                `justified lines should fill content width (sample=${JSON.stringify(sampleTw)})`,
            );
        },
    },
    {
        name: 'keeps all text runs inside design content boxes',
        fn: () => {
            const longProfile = {
                ...sampleProfile,
                full_name: 'Alexandra Bartholomew-Montgomery',
                headline: 'Principal Full-Stack Platform Engineer & Technical Lead',
                email: 'verylong.candidate.name.with.extra.detail@corporation-example.com',
                linkedin_url: 'https://www.linkedin.com/in/alexandra-bartholomew-montgomery-platform',
                website_url: 'https://alexandra-bartholomew-montgomery.dev/portfolio/case-studies',
            };
            const body = Array.from(
                { length: 18 },
                () => 'This experience demonstrates strong delivery across complex product work with stakeholders',
            ).join(' ') + '.';
            const letter = `Dear Hiring Manager,\n\nPlease visit https://example.com/${'supercalifragilisticexpialidocious'.repeat(3)}/x and email me.\n\n${body}\n\nYours faithfully,\nAlex`;

            for (const design of ['teal-masthead', 'ink-sidebar', 'forest-rail', 'geometric-mark', 'swiss-rules']) {
                const serif = design === 'ink-sidebar';
                const pdf = new TextDecoder('latin1').decode(buildCoverLetterPdfBytes(letter, {
                    design,
                    font: serif ? 'literata' : 'clash-display',
                    profile: longProfile,
                    job: { title: 'Senior Software Engineer', company: 'Acme Corporation International' },
                }));
                const bounds = contentBoundsForDesign(design);
                const ops = parsePdfTextOps(pdf);
                assert.ok(ops.length > 0, `${design} should emit text`);

                for (const op of ops) {
                    const metricsKey = metricsKeyForFont(op.font, serif);
                    const width = measurePdfRenderedWidth(op.text, op.size, metricsKey, op.tw);
                    const end = op.x + width;
                    const inSidebar = bounds.sideLeft != null && op.x < 150;
                    const right = inSidebar ? bounds.sideRight : bounds.mainRight;

                    assert.ok(
                        end <= right + 0.75,
                        `${design} overflow: x=${op.x} end=${end.toFixed(2)} right=${right} text=${JSON.stringify(op.text.slice(0, 48))}`,
                    );
                }

                if (design === 'teal-masthead' || design === 'ink-sidebar') {
                    const bodyMetrics = serif ? 'times-roman' : 'helvetica';
                    const justified = ops.filter((op) => op.tw > 0 && op.size === 11.5);
                    assert.ok(justified.length > 0, `${design} should justify body lines`);
                    const contentWidth = bounds.mainRight - bounds.mainLeft;
                    const filled = justified.some((op) => {
                        const visual = measurePdfRenderedWidth(op.text, op.size, bodyMetrics, op.tw);

                        return visual >= contentWidth * 0.995 && visual <= contentWidth + 0.05;
                    });
                    assert.equal(filled, true, `${design} justified body should reach content width ${contentWidth}`);
                }
            }
        },
    },
    {
        name: 'embeds clickable mailto tel and https link annotations',
        fn: () => {
            const pdf = new TextDecoder().decode(buildCoverLetterPdfBytes(
                'Dear Hiring Manager,\n\nPlease email alex.morgan@example.com or visit https://alexmorgan.dev/portfolio.\n\nYours faithfully,\nAlex Morgan',
                {
                    design: 'teal-masthead',
                    profile: sampleProfile,
                },
            ));

            assert.match(pdf, /\/Annots/);
            assert.match(pdf, /\/URI \(mailto:alex\.morgan@example\.com\)/);
            assert.match(pdf, /\/URI \(tel:\+447700900123\)/);
            assert.match(pdf, /\/URI \(https:\/\/linkedin\.com\/in\/alexmorgan\)/);
            assert.match(pdf, /\/URI \(https:\/\/alexmorgan\.dev\)/);
            assert.match(pdf, /\/URI \(https:\/\/alexmorgan\.dev\/portfolio\)/);
        },
    },
    {
        name: 'ink-sidebar wraps long sidebar contact emails',
        fn: () => {
            const longEmail = 'verylong.candidate.name.with.extra.detail@corporation-example.com';
            const pdf = new TextDecoder().decode(buildCoverLetterPdfBytes(
                'Dear hiring manager,\n\nI am excited to apply.',
                {
                    design: 'ink-sidebar',
                    profile: {
                        ...sampleProfile,
                        full_name: 'Alexandra Bartholomew-Montgomery',
                        headline: 'Principal Full-Stack Platform Engineer',
                        email: longEmail,
                    },
                },
            ));

            assert.match(pdf, /verylong\.candidate\.name/);
            assert.match(pdf, /corporation-/);
            assert.match(pdf, /example\.com/);
            assert.doesNotMatch(pdf, new RegExp(`\\(${longEmail.replaceAll('.', '\\.')}\\)`));
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
        name: 'encodes pound sign and accented characters for win-ansi',
        fn: () => {
            const pdf = new TextDecoder('latin1').decode(buildCoverLetterPdfBytes(
                'Candidatura à vaga\n\nSalary expectation: £85k.\nÉquipe Form Health.',
                { profile: sampleProfile },
            ));

            assert.match(pdf, /Candidatura à vaga/);
            assert.match(pdf, /Salary expectation: £85k\./);
            assert.match(pdf, /Équipe Form Health\./);
            assert.doesNotMatch(pdf, /Candidatura Ã/);
            assert.doesNotMatch(pdf, /Â£/);
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
    {
        name: 'strips duplicate contact letterhead before PDF body',
        fn: () => {
            const profile = {
                full_name: 'Toby Claxton',
                headline: 'AI Implementation Executive Assoc. at CineArk',
                email: 'tmwclaxton@gmail.com',
                phone: '07837370669',
                location: 'Wycombe, England',
                city: 'High Wycombe',
            };
            const duplicated = [
                'Toby Claxton',
                'tmwclaxton@gmail.com',
                '07837370669',
                'High Wycombe',
                'I am writing to apply for the Product Engineer role.',
                '',
                'Yours faithfully,',
                'Toby Claxton',
            ].join('\n');

            assert.equal(
                stripLeadingCoverLetterLetterhead(duplicated, profile),
                [
                    'I am writing to apply for the Product Engineer role.',
                    '',
                    'Yours faithfully,',
                    'Toby Claxton',
                ].join('\n'),
            );

            const pdf = new TextDecoder().decode(buildCoverLetterPdfBytes(duplicated, {
                profile,
                job: { title: 'Product Engineer', company: 'Lever' },
            }));
            const visibleText = pdf.replace(/\/URI \([^)]+\)/g, '');

            assert.equal([...visibleText.matchAll(/tmwclaxton@gmail\.com/g)].length, 1);
            assert.equal([...visibleText.matchAll(/07837370669/g)].length, 1);
            assert.match(pdf, /I am writing to apply for the Product Engineer role\./);
            assert.match(pdf, /Yours faithfully,/);
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
