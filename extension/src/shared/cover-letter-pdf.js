import { arrayBufferToBase64, triggerBrowserDownload } from './file-transfer.js';

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;

const COLOR_INK = [0.102, 0.102, 0.18];
const COLOR_MUTED = [0.42, 0.42, 0.45];

const FONT_BODY = 'F3';
const FONT_SANS = 'F2';
const FONT_SANS_BOLD = 'F1';

const SIZE_NAME = 12;
const SIZE_CONTACT = 10;
const SIZE_META = 10.5;
const SIZE_BODY = 11.5;
const BODY_LEADING = 16;
const PARAGRAPH_GAP = 10;
const HEADER_GAP_BEFORE_BODY = 22;

function normalizeForPdfText(text) {
    return text
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

function escapePdfString(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\r/g, '');
}

function estimateTextWidth(text, fontSize) {
    return text.length * fontSize * 0.48;
}

function formatLetterDate(date = new Date()) {
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export function buildContactLine(profile) {
    const parts = [
        profile?.email,
        profile?.phone,
        profile?.city,
    ]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);

    return parts.join(' | ');
}

function wrapParagraphLine(line, maxChars) {
    if (line.length <= maxChars) {
        return [line];
    }

    const words = line.split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;

        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }

        if (current) {
            lines.push(current);
        }

        if (word.length > maxChars) {
            for (let index = 0; index < word.length; index += maxChars) {
                lines.push(word.slice(index, index + maxChars));
            }

            current = '';
            continue;
        }

        current = word;
    }

    if (current) {
        lines.push(current);
    }

    return lines;
}

export function layoutCoverLetterLines(text, maxChars = 78) {
    const lines = [];

    for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
        if (paragraph.trim() === '') {
            lines.push('');
            continue;
        }

        for (const wrapped of wrapParagraphLine(paragraph, maxChars)) {
            lines.push(wrapped);
        }
    }

    return lines;
}

function splitCoverLetterParagraphs(text) {
    return text
        .replace(/\r\n/g, '\n')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

function buildStyledLayoutItems(text, { profile = null } = {}) {
    const items = [];
    let y = PDF_HEIGHT - MARGIN_TOP;
    const contentBottom = MARGIN_BOTTOM;

    const pushGap = (amount) => {
        y -= amount;
    };

    const ensureSpace = (height) => {
        if (y - height < contentBottom) {
            items.push({ type: 'page-break' });
            y = PDF_HEIGHT - MARGIN_TOP;
        }
    };

    const pushText = ({
        text: lineText,
        font = FONT_BODY,
        size = SIZE_BODY,
        color = COLOR_INK,
        align = 'left',
        leading = BODY_LEADING,
    }) => {
        ensureSpace(leading);
        items.push({
            type: 'text',
            text: lineText,
            font,
            size,
            color,
            align,
            y,
        });
        y -= leading;
    };

    const fullName = String(profile?.full_name ?? '').trim();
    const contactLine = buildContactLine(profile);

    if (fullName) {
        pushText({
            text: fullName,
            font: FONT_SANS_BOLD,
            size: SIZE_NAME,
            color: COLOR_INK,
            leading: 16,
        });
    }

    if (contactLine) {
        pushText({
            text: contactLine,
            font: FONT_SANS,
            size: SIZE_CONTACT,
            color: COLOR_MUTED,
            leading: 14,
        });
    }

    if (fullName || contactLine) {
        pushGap(10);
    }

    pushText({
        text: formatLetterDate(),
        font: FONT_SANS,
        size: SIZE_META,
        color: COLOR_INK,
        leading: 14,
    });

    pushGap(HEADER_GAP_BEFORE_BODY);

    const paragraphs = splitCoverLetterParagraphs(text);

    paragraphs.forEach((paragraph, index) => {
        const lines = layoutCoverLetterLines(paragraph);

        lines.forEach((line) => {
            pushText({
                text: line,
                font: FONT_BODY,
                size: SIZE_BODY,
                color: COLOR_INK,
                leading: BODY_LEADING,
            });
        });

        if (index < paragraphs.length - 1) {
            pushGap(PARAGRAPH_GAP);
        }
    });

    return items;
}

function paginateLayoutItems(items) {
    const pages = [[]];
    let pageIndex = 0;

    for (const item of items) {
        if (item.type === 'page-break') {
            pages.push([]);
            pageIndex += 1;
            continue;
        }

        pages[pageIndex].push(item);
    }

    return pages.filter((page) => page.length > 0);
}

function buildPageContentStream(pageItems) {
    const parts = [];

    for (const item of pageItems) {
        if (item.type !== 'text') {
            continue;
        }

        const [red, green, blue] = item.color;
        let x = MARGIN_LEFT;

        if (item.align === 'right') {
            x = PDF_WIDTH - MARGIN_RIGHT - estimateTextWidth(item.text, item.size);
        }

        parts.push('BT');
        parts.push(`${red} ${green} ${blue} rg`);
        parts.push(`${item.font} ${item.size} Tf`);
        parts.push(`${x} ${item.y} Td`);
        parts.push(`(${escapePdfString(item.text)}) Tj`);
        parts.push('ET');
    }

    return parts.join('\n');
}

export function buildCoverLetterPdfBytes(text, options = {}) {
    const normalized = normalizeForPdfText(String(text ?? '').trim());

    if (normalized === '') {
        throw new Error('Nothing to download yet.');
    }

    const pageItems = paginateLayoutItems(buildStyledLayoutItems(normalized, options));
    const pageContents = pageItems.map((items) => buildPageContentStream(items));

    const chunks = ['%PDF-1.4\n'];
    const offsets = [0];

    const addObject = (objectNumber, body) => {
        offsets[objectNumber] = chunks.join('').length;
        chunks.push(`${objectNumber} 0 obj\n${body}\nendobj\n`);
    };

    const fontObjects = {
        [FONT_SANS_BOLD]: 3,
        [FONT_SANS]: 4,
        [FONT_BODY]: 5,
    };
    const firstPageObjectNumber = 6;
    const pageObjectNumbers = pageContents.map((_, index) => firstPageObjectNumber + (index * 2));
    const streamObjectNumbers = pageContents.map((_, index) => firstPageObjectNumber + 1 + (index * 2));
    const lastObjectNumber = streamObjectNumbers.at(-1) ?? fontObjects[FONT_BODY];

    addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObject(
        2,
        `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(' ')}] /Count ${pageContents.length} >>`,
    );
    addObject(
        fontObjects[FONT_SANS_BOLD],
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );
    addObject(
        fontObjects[FONT_SANS],
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    addObject(
        fontObjects[FONT_BODY],
        '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
    );

    pageContents.forEach((content, index) => {
        const streamObjectNumber = streamObjectNumbers[index];
        const pageObjectNumber = pageObjectNumbers[index];

        addObject(
            streamObjectNumber,
            `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        );
        addObject(
            pageObjectNumber,
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${streamObjectNumber} 0 R >>`,
        );
    });

    const xrefOffset = chunks.join('').length;
    chunks.push(`xref\n0 ${lastObjectNumber + 1}\n`);
    chunks.push('0000000000 65535 f \n');

    for (let objectNumber = 1; objectNumber <= lastObjectNumber; objectNumber += 1) {
        chunks.push(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`);
    }

    chunks.push(
        `trailer\n<< /Size ${lastObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    );

    return new TextEncoder().encode(chunks.join(''));
}

export function buildCoverLetterPdfFileName({ jobTitle = null, company = null } = {}) {
    const slug = [jobTitle, company, 'cover-letter']
        .map((value) => String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''))
        .filter(Boolean)
        .join('-');

    return `${slug || 'cover-letter'}.pdf`;
}

export function downloadCoverLetterPdf({ text, fileName, profile = null, job = null }) {
    const bytes = buildCoverLetterPdfBytes(text, { profile, job });
    const base64 = arrayBufferToBase64(bytes.buffer);

    triggerBrowserDownload({
        base64,
        fileName,
        mimeType: 'application/pdf',
    });
}
