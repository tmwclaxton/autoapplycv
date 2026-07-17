import {
    coverLetterAccent,
    coverLetterFontIsSerif,
    resolveCoverLetterDesignSettings,
} from './cover-letter-designs.js';
import {
    measurePdfRenderedWidth,
    measurePdfTextWidth,
    wrapPdfTextToWidth,
} from './cover-letter-pdf-metrics.js';
import { arrayBufferToBase64, triggerBrowserDownload } from './file-transfer.js';
import { encodeForWinAnsiPdf, normalizePdfText } from './pdf-win-ansi.js';

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;

const COLOR_INK = [0.102, 0.102, 0.18];
const COLOR_MUTED = [0.42, 0.42, 0.45];
const COLOR_WHITE = [1, 1, 1];

const FONT_BODY = 'F3';
const FONT_SANS = 'F2';
const FONT_SANS_BOLD = 'F1';

const SIZE_NAME = 18;
const SIZE_CONTACT = 10;
const SIZE_META = 10.5;
const SIZE_BODY = 11.5;
const BODY_LEADING = 16;
const PARAGRAPH_GAP = 10;
const HEADER_GAP_BEFORE_BODY = 22;

function normalizeForPdfText(text) {
    return normalizePdfText(text);
}

function escapePdfString(value) {
    return encodeForWinAnsiPdf(normalizePdfText(value))
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\r/g, '');
}

function metricsKeyForPdfFont(pdfFont, serif) {
    if (pdfFont === FONT_SANS_BOLD) {
        return serif ? 'times-bold' : 'helvetica-bold';
    }

    return serif ? 'times-roman' : 'helvetica';
}

export function estimateTextWidth(text, fontSize, metricsKey = 'helvetica') {
    return measurePdfTextWidth(text, fontSize, metricsKey);
}

function estimateRenderedWidth(text, fontSize, metricsKey = 'helvetica', wordSpacing = 0) {
    return measurePdfRenderedWidth(text, fontSize, metricsKey, wordSpacing);
}

function formatLetterDate(date = new Date()) {
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function looksLikePhoneValue(value) {
    const trimmed = String(value ?? '').trim();
    const digits = trimmed.replace(/\D+/g, '');

    return digits.length >= 7
        && digits.length <= 15
        && /^[\d\s\-+().]+$/.test(trimmed);
}

function normalizePhoneHref(value) {
    const trimmed = String(value ?? '').trim();

    if (trimmed.includes('+')) {
        return `+${trimmed.replace(/\D+/g, '')}`;
    }

    return trimmed.replace(/\D+/g, '');
}

export function hrefForUrl(value) {
    const trimmed = String(value ?? '').trim();

    if (!trimmed) {
        return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    if (/^www\./i.test(trimmed)) {
        return `https://${trimmed}`;
    }

    if (/^(linkedin\.com\/|github\.com\/)/i.test(trimmed)) {
        return `https://${trimmed}`;
    }

    if (/^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
        return `https://${trimmed}`;
    }

    return null;
}

export function hrefForContactValue(value) {
    const trimmed = String(value ?? '').trim();

    if (!trimmed) {
        return null;
    }

    if (/^\S+@\S+\.\S+$/.test(trimmed)) {
        return `mailto:${trimmed}`;
    }

    if (looksLikePhoneValue(trimmed)) {
        return `tel:${normalizePhoneHref(trimmed)}`;
    }

    return hrefForUrl(trimmed);
}

/**
 * @returns {Array<{ label: string, text: string, href: string|null }>}
 */
export function buildContactParts(profile) {
    if (!profile) {
        return [];
    }

    const candidates = [
        { label: 'Email', text: String(profile.email ?? '').trim() },
        { label: 'Phone', text: String(profile.phone ?? '').trim() },
        { label: 'Location', text: String(profile.location || profile.city || '').trim() },
        { label: 'LinkedIn', text: String(profile.linkedin_url ?? '').trim() },
        { label: 'Web', text: String(profile.website_url ?? '').trim() },
    ];

    return candidates
        .filter((part) => part.text)
        .map((part) => ({
            ...part,
            href: part.label === 'Location' ? null : hrefForContactValue(part.text),
        }));
}

export function buildContactLine(profile) {
    return buildContactParts(profile)
        .map((part) => part.text)
        .join(' | ');
}

function contactLineLinkMatches(parts) {
    const matches = [];
    let offset = 0;
    const sep = ' | ';

    parts.forEach((part, index) => {
        if (part.href) {
            matches.push({
                start: offset,
                end: offset + part.text.length,
                href: part.href,
            });
        }

        offset += part.text.length;

        if (index < parts.length - 1) {
            offset += sep.length;
        }
    });

    return matches;
}

export function findTextLinkMatches(text) {
    const value = String(text ?? '');
    const candidates = [];

    for (const match of value.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
        candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            href: `mailto:${match[0]}`,
        });
    }

    for (const match of value.matchAll(/\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:linkedin|github)\.com\/[^\s<>()]+/gi)) {
        let end = match.index + match[0].length;

        while (end > match.index && '.,);'.includes(value[end - 1])) {
            end -= 1;
        }

        const token = value.slice(match.index, end);
        const href = hrefForUrl(token);

        if (href) {
            candidates.push({ start: match.index, end, href });
        }
    }

    for (const match of value.matchAll(/(?<![\w@])(?:\+?\d[\d\s().-]{6,}\d)/g)) {
        const token = match[0].trim();

        if (!looksLikePhoneValue(token)) {
            continue;
        }

        candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            href: `tel:${normalizePhoneHref(token)}`,
        });
    }

    candidates.sort((left, right) => left.start - right.start);

    const matches = [];
    let lastEnd = -1;

    for (const candidate of candidates) {
        if (candidate.start < lastEnd) {
            continue;
        }

        matches.push(candidate);
        lastEnd = candidate.end;
    }

    return matches;
}

export function wrapParagraphLine(line, maxWidth, fontSize = SIZE_BODY, metricsKey = 'helvetica') {
    return wrapPdfTextToWidth(line, maxWidth, fontSize, metricsKey);
}

export function layoutCoverLetterLines(
    text,
    maxWidth = PDF_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
    fontSize = SIZE_BODY,
    metricsKey = 'helvetica',
) {
    return wrapPdfTextToWidth(text, maxWidth, fontSize, metricsKey);
}

function splitCoverLetterParagraphs(text) {
    return text
        .replace(/\r\n/g, '\n')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

function normalizeIdentityValue(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function identityValuesFromProfile(profile) {
    if (!profile) {
        return [];
    }

    return [
        profile.full_name,
        profile.headline,
        profile.email,
        profile.phone,
        profile.location,
        profile.city,
    ]
        .map((value) => normalizeIdentityValue(value))
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
}

function looksLikeGreeting(line) {
    return /^(dear\b|to whom it may concern\b|hi\b|hello\b)/i.test(String(line ?? '').trim());
}

function looksLikeSignOff(line) {
    return /^\s*(yours\s+(sincerely|faithfully)|kind\s+regards|best\s+regards|warm\s+regards|regards|sincerely)\s*,?\s*$/i
        .test(String(line ?? '').trim());
}

function isJustifiableBodyParagraph(paragraph) {
    const firstLine = String(paragraph ?? '').split('\n')[0]?.trim() ?? '';

    if (!firstLine || looksLikeGreeting(firstLine) || looksLikeSignOff(firstLine)) {
        return false;
    }

    return true;
}

function looksLikeProseStart(line) {
    const trimmed = String(line ?? '').trim();

    if (/^(I|I'm|I'd|My|As|Having|With|Please|Thank|Following)\b/i.test(trimmed)) {
        return true;
    }

    if (trimmed.length > 90) {
        return true;
    }

    return /[.!?]/.test(trimmed) && trimmed.split(/\s+/).filter(Boolean).length > 8;
}

function isLooseLocationMatch(line, identityValue) {
    if (!line || !identityValue) {
        return false;
    }

    if (identityValue.includes(line) || line.includes(identityValue)) {
        return true;
    }

    const lineTokens = line.split(/[\s,]+/).filter(Boolean);
    const identityTokens = identityValue.split(/[\s,]+/).filter(Boolean);

    if (lineTokens.length === 0 || identityTokens.length === 0) {
        return false;
    }

    const overlap = lineTokens.filter((token) => identityTokens.includes(token));

    return overlap.length >= 1 && lineTokens.length <= 4;
}

function looksLikeLetterheadLine(line, identityValues) {
    const trimmed = String(line ?? '').trim();
    const normalized = normalizeIdentityValue(trimmed);

    if (!normalized) {
        return false;
    }

    for (const value of identityValues) {
        if (value === normalized) {
            return true;
        }

        if (
            isLooseLocationMatch(normalized, value)
            && trimmed.split(/\s+/).filter(Boolean).length <= 6
            && !/[.!?]/.test(trimmed)
        ) {
            return true;
        }
    }

    if (/^\S+@\S+\.\S+$/.test(trimmed)) {
        return true;
    }

    const digits = trimmed.replace(/\D+/g, '');

    if (digits.length >= 7 && digits.length <= 15 && /^[\d\s\-+().]+$/.test(trimmed)) {
        return true;
    }

    if (trimmed.includes('|') && (trimmed.includes('@') || /\d{3,}/.test(trimmed))) {
        return true;
    }

    if (/^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(trimmed)) {
        return true;
    }

    if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i.test(trimmed)) {
        return true;
    }

    if (/^[A-Z0-9][A-Z0-9\s/&.,'-]{2,}(?:·|•|\|)[A-Z0-9\s/&.,'-]{2,}$/u.test(trimmed)) {
        return true;
    }

    return false;
}

/**
 * Strip a leading contact/name stack that duplicates the designed PDF header.
 */
export function stripLeadingCoverLetterLetterhead(text, profile = null) {
    const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    if (!normalized) {
        return '';
    }

    const lines = normalized.split('\n');
    const identityValues = identityValuesFromProfile(profile);
    let index = 0;

    while (index < lines.length) {
        const line = lines[index].trim();

        if (line === '') {
            index += 1;
            continue;
        }

        if (looksLikeGreeting(line) || looksLikeProseStart(line)) {
            break;
        }

        if (looksLikeLetterheadLine(line, identityValues)) {
            index += 1;
            continue;
        }

        break;
    }

    return lines.slice(index).join('\n').trim();
}

function monogram(fullName) {
    return String(fullName ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'CL';
}

function buildStyledLayoutItems(text, {
    profile = null,
    job = null,
    design = 'teal-masthead',
    font = 'clash-display',
    includeDate = true,
} = {}) {
    const items = [];
    let marginLeft = MARGIN_LEFT;
    let contentWidth = PDF_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    let y = PDF_HEIGHT - MARGIN_TOP;
    const contentBottom = MARGIN_BOTTOM;
    const accent = coverLetterAccent(design);
    const serif = coverLetterFontIsSerif(font);
    const bodyFont = serif ? FONT_BODY : FONT_SANS;
    const bandDesigns = new Set(['teal-masthead', 'mono-bold', 'ocean-wash', 'slate-bands']);

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
        font: textFont = FONT_BODY,
        size = SIZE_BODY,
        color = COLOR_INK,
        align = 'left',
        leading = BODY_LEADING,
        x = marginLeft,
        maxWidth = contentWidth,
        linkMatches = null,
        justify = false,
        wrap = true,
    }) => {
        const metricsKey = metricsKeyForPdfFont(textFont, serif);
        const widthLimit = maxWidth == null ? contentWidth : maxWidth;
        const wrapped = wrap
            ? wrapPdfTextToWidth(String(lineText ?? ''), widthLimit, size, metricsKey)
            : [String(lineText ?? '')];

        wrapped.forEach((line, lineIndex) => {
            const isLastLine = lineIndex === wrapped.length - 1;
            const lineAlign = justify && !isLastLine && line.includes(' ')
                ? 'justify'
                : (align === 'justify' ? 'left' : align);
            ensureSpace(leading);
            const matches = Array.isArray(linkMatches) && wrapped.length === 1
                ? linkMatches
                : findTextLinkMatches(line);

            items.push({
                type: 'text',
                text: line,
                font: textFont,
                size,
                color,
                align: lineAlign,
                x,
                y,
                maxWidth: widthLimit,
                metricsKey,
                linkMatches: matches.length > 0 ? matches : null,
            });
            y -= leading;
        });
    };

    let fullName = String(profile?.full_name ?? '').trim();
    let headline = String(profile?.headline ?? '').trim();
    const contactParts = buildContactParts(profile);
    let contactLine = contactParts.map((part) => part.text).join(' | ');
    let contactLinks = contactLineLinkMatches(contactParts);

    if (design === 'ink-sidebar') {
        const rail = 150;
        const sideX = 18;
        const sideWidth = rail - (sideX * 2);
        items.push({
            type: 'rect', x: 0, y: 0, w: rail, h: PDF_HEIGHT, color: accent,
        });
        marginLeft = rail + 28;
        contentWidth = PDF_WIDTH - marginLeft - MARGIN_RIGHT;
        let sideY = PDF_HEIGHT - 56;

        const pushSidebarText = (text, textFont, size, color, leading, href = null) => {
            const metricsKey = metricsKeyForPdfFont(textFont, serif);

            for (const line of wrapPdfTextToWidth(text, sideWidth, size, metricsKey)) {
                items.push({
                    type: 'text',
                    text: line,
                    font: textFont,
                    size,
                    color,
                    align: 'left',
                    x: sideX,
                    y: sideY,
                    maxWidth: sideWidth,
                    metricsKey,
                    linkMatches: href
                        ? [{ start: 0, end: line.length, href }]
                        : null,
                });
                sideY -= leading;
            }
        };

        if (fullName) {
            pushSidebarText(fullName, FONT_SANS_BOLD, 14, COLOR_WHITE, 16);
            sideY -= 2;
        }

        if (headline) {
            pushSidebarText(headline, FONT_SANS, 9, [0.85, 0.85, 0.88], 12);
            sideY -= 4;
        }

        for (const part of contactParts) {
            pushSidebarText(part.text, FONT_SANS, 8.5, [0.82, 0.82, 0.86], 11, part.href);
            sideY -= 2;
        }

        y = PDF_HEIGHT - 56;
        fullName = '';
        headline = '';
        contactLine = '';
        contactLinks = [];
    } else if (design === 'forest-rail') {
        items.push({
            type: 'rect', x: 0, y: 0, w: 12, h: PDF_HEIGHT, color: accent,
        });
        marginLeft = 56;
        contentWidth = PDF_WIDTH - marginLeft - MARGIN_RIGHT;
    } else if (design === 'geometric-mark' && fullName) {
        items.push({
            type: 'rect',
            x: marginLeft,
            y: PDF_HEIGHT - MARGIN_TOP - 36,
            w: 40,
            h: 40,
            color: accent,
            stroke: true,
        });
        items.push({
            type: 'text',
            text: monogram(fullName),
            font: FONT_SANS_BOLD,
            size: 14,
            color: accent,
            align: 'left',
            x: marginLeft + 8,
            y: PDF_HEIGHT - MARGIN_TOP - 12,
            maxWidth: 36,
            metricsKey: metricsKeyForPdfFont(FONT_SANS_BOLD, serif),
        });
        marginLeft += 52;
        contentWidth = PDF_WIDTH - marginLeft - MARGIN_RIGHT;
    } else if (bandDesigns.has(design)) {
        const bandHeight = design === 'slate-bands' ? 96 : 108;
        items.push({
            type: 'rect',
            x: 0,
            y: PDF_HEIGHT - bandHeight,
            w: PDF_WIDTH,
            h: bandHeight,
            color: design === 'slate-bands' ? [0.886, 0.910, 0.941] : accent,
        });
        y = PDF_HEIGHT - 34;
        const nameColor = design === 'slate-bands' ? COLOR_INK : COLOR_WHITE;
        const metaColor = design === 'slate-bands' ? COLOR_MUTED : [0.92, 0.92, 0.94];

        if (fullName) {
            pushText({
                text: fullName, font: FONT_SANS_BOLD, size: SIZE_NAME,
                color: nameColor, leading: 22,
            });
        }

        if (headline) {
            pushText({
                text: headline, font: FONT_SANS, size: SIZE_CONTACT,
                color: metaColor, leading: 14,
            });
        }

        if (contactLine) {
            pushText({
                text: contactLine, font: FONT_SANS, size: 9,
                color: metaColor, leading: 12,
                linkMatches: contactLinks,
            });
        }

        y = PDF_HEIGHT - bandHeight - 24;
        fullName = '';
        headline = '';
        contactLine = '';
        contactLinks = [];
    } else if (design === 'asymmetric-split') {
        items.push({
            type: 'rect',
            x: marginLeft,
            y: PDF_HEIGHT - MARGIN_TOP - 52,
            w: contentWidth,
            h: 2.5,
            color: accent,
        });
    } else if (design === 'swiss-rules') {
        items.push({
            type: 'rect',
            x: marginLeft,
            y: PDF_HEIGHT - MARGIN_TOP - 58,
            w: contentWidth,
            h: 0.8,
            color: accent,
        });
    } else if (design === 'coral-timeline') {
        items.push({
            type: 'rect',
            x: marginLeft - 18,
            y: MARGIN_BOTTOM,
            w: 2,
            h: PDF_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
            color: [0.94, 0.82, 0.78],
        });
    }

    if (fullName) {
        pushText({
            text: fullName,
            font: FONT_SANS_BOLD,
            size: design === 'swiss-rules' ? 22 : SIZE_NAME,
            color: design === 'forest-rail' ? accent : COLOR_INK,
            leading: 22,
        });
    }

    if (headline) {
        pushText({
            text: headline,
            font: FONT_SANS,
            size: SIZE_CONTACT,
            color: ['coral-timeline', 'asymmetric-split'].includes(design) ? accent : COLOR_MUTED,
            leading: 14,
        });
    }

    if (contactLine) {
        pushText({
            text: contactLine,
            font: FONT_SANS,
            size: SIZE_CONTACT,
            color: COLOR_MUTED,
            leading: 14,
            linkMatches: contactLinks,
        });
    }

    if (fullName || headline || contactLine) {
        pushGap(10);
    }

    const jobTitle = String(job?.title ?? '').trim();
    const company = String(job?.company ?? '').trim();

    if (jobTitle || company) {
        pushText({
            text: [jobTitle, company].filter(Boolean).join(' · ').toUpperCase(),
            font: FONT_SANS,
            size: 9,
            color: COLOR_MUTED,
            leading: 12,
        });
        pushGap(6);
    }

    if (includeDate) {
        if (design === 'coral-timeline') {
            items.push({
                type: 'rect',
                x: marginLeft - 22,
                y: y - 3,
                w: 8,
                h: 8,
                color: accent,
            });
        }

        pushText({
            text: formatLetterDate(),
            font: FONT_SANS,
            size: SIZE_META,
            color: design === 'coral-timeline' ? accent : COLOR_INK,
            leading: 14,
        });
        pushGap(HEADER_GAP_BEFORE_BODY);
    } else if (fullName || headline || contactLine) {
        pushGap(HEADER_GAP_BEFORE_BODY - 10);
    }

    const paragraphs = splitCoverLetterParagraphs(text);

    paragraphs.forEach((paragraph, index) => {
        pushText({
            text: paragraph,
            font: bodyFont,
            size: SIZE_BODY,
            color: COLOR_INK,
            leading: BODY_LEADING,
            maxWidth: contentWidth,
            justify: isJustifiableBodyParagraph(paragraph),
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
    const annots = [];

    for (const item of pageItems) {
        if (item.type === 'rect') {
            const [red, green, blue] = item.color;

            if (item.stroke) {
                parts.push(`${red} ${green} ${blue} RG`);
                parts.push('2 w');
                parts.push(`${item.x} ${item.y} ${item.w} ${item.h} re S`);
            } else {
                parts.push(`${red} ${green} ${blue} rg`);
                parts.push(`${item.x} ${item.y} ${item.w} ${item.h} re f`);
            }

            continue;
        }

        if (item.type !== 'text') {
            continue;
        }

        const [red, green, blue] = item.color;
        let x = item.x ?? MARGIN_LEFT;
        let wordSpacing = 0;
        const lineText = String(item.text ?? '');
        const metricsKey = item.metricsKey
            || metricsKeyForPdfFont(item.font, false);

        if (item.align === 'right') {
            x = PDF_WIDTH - MARGIN_RIGHT - estimateTextWidth(lineText, item.size, metricsKey);
        } else if (item.align === 'justify') {
            const spaces = (lineText.match(/ /g) || []).length;
            const maxWidth = Number(item.maxWidth) || 0;

            if (spaces > 0 && maxWidth > 0) {
                const naturalWidth = estimateTextWidth(lineText, item.size, metricsKey);
                wordSpacing = Math.max(0, (maxWidth - naturalWidth) / spaces);
            }
        }

        if (wordSpacing > 0) {
            parts.push(`${wordSpacing.toFixed(3)} Tw`);
        }

        parts.push('BT');
        parts.push(`${red} ${green} ${blue} rg`);
        parts.push(`${item.font} ${item.size} Tf`);
        parts.push(`${x} ${item.y} Td`);
        parts.push(`(${escapePdfString(lineText)}) Tj`);
        parts.push('ET');

        if (wordSpacing > 0) {
            parts.push('0 Tw');
        }

        for (const match of item.linkMatches || []) {
            if (!match?.href || match.end <= match.start) {
                continue;
            }

            const prefix = lineText.slice(0, match.start);
            const token = lineText.slice(match.start, match.end);
            const llx = x + estimateRenderedWidth(prefix, item.size, metricsKey, wordSpacing);
            const linkWidth = Math.max(
                estimateRenderedWidth(token, item.size, metricsKey, wordSpacing),
                item.size * 0.25,
            );
            const lly = item.y - (item.size * 0.2);
            const ury = item.y + (item.size * 0.8);

            annots.push({
                rect: [llx, lly, llx + linkWidth, ury],
                uri: match.href,
            });
        }
    }

    return {
        content: parts.join('\n'),
        annots,
    };
}

export function buildCoverLetterPdfBytes(text, options = {}) {
    const profile = options.profile?.profile || options.profile || null;
    let normalized = normalizeForPdfText(String(text ?? '').trim());
    normalized = normalizeForPdfText(stripLeadingCoverLetterLetterhead(normalized, profile));

    if (normalized === '') {
        throw new Error('Nothing to download yet.');
    }

    const resolved = resolveCoverLetterDesignSettings(
        options.design ?? profile?.cover_letter_design,
        options.font ?? profile?.cover_letter_font,
    );

    const pageItems = paginateLayoutItems(buildStyledLayoutItems(normalized, {
        profile,
        job: options.job || null,
        design: resolved.design,
        font: resolved.font,
        includeDate: options.include_date !== false,
    }));
    const pagePayloads = pageItems.map((items) => buildPageContentStream(items));
    const serif = coverLetterFontIsSerif(resolved.font);

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

    let nextObjectNumber = 6;
    const pageAllocations = pagePayloads.map((payload) => {
        const streamObjectNumber = nextObjectNumber;
        nextObjectNumber += 1;
        const annotObjectNumbers = payload.annots.map(() => {
            const objectNumber = nextObjectNumber;
            nextObjectNumber += 1;

            return objectNumber;
        });
        const pageObjectNumber = nextObjectNumber;
        nextObjectNumber += 1;

        return {
            payload,
            streamObjectNumber,
            annotObjectNumbers,
            pageObjectNumber,
        };
    });
    const pageObjectNumbers = pageAllocations.map((allocation) => allocation.pageObjectNumber);
    const lastObjectNumber = nextObjectNumber - 1;

    addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObject(
        2,
        `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(' ')}] /Count ${pagePayloads.length} >>`,
    );
    addObject(
        fontObjects[FONT_SANS_BOLD],
        `<< /Type /Font /Subtype /Type1 /BaseFont /${serif ? 'Times-Bold' : 'Helvetica-Bold'} /Encoding /WinAnsiEncoding >>`,
    );
    addObject(
        fontObjects[FONT_SANS],
        `<< /Type /Font /Subtype /Type1 /BaseFont /${serif ? 'Times-Roman' : 'Helvetica'} /Encoding /WinAnsiEncoding >>`,
    );
    addObject(
        fontObjects[FONT_BODY],
        `<< /Type /Font /Subtype /Type1 /BaseFont /${serif ? 'Times-Roman' : 'Helvetica'} /Encoding /WinAnsiEncoding >>`,
    );

    pageAllocations.forEach(({
        payload, streamObjectNumber, annotObjectNumbers, pageObjectNumber,
    }) => {
        addObject(
            streamObjectNumber,
            `<< /Length ${payload.content.length} >>\nstream\n${payload.content}\nendstream`,
        );

        payload.annots.forEach((annot, annotIndex) => {
            const [llx, lly, urx, ury] = annot.rect;
            const rect = [llx, lly, urx, ury].map((value) => value.toFixed(2)).join(' ');
            addObject(
                annotObjectNumbers[annotIndex],
                `<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfString(annot.uri)}) >> >>`,
            );
        });

        const annotsRef = annotObjectNumbers.length > 0
            ? ` /Annots [${annotObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(' ')}]`
            : '';

        addObject(
            pageObjectNumber,
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${streamObjectNumber} 0 R${annotsRef} >>`,
        );
    });

    const xrefOffset = chunks.join('').length;
    chunks.push(`xref\n0 ${lastObjectNumber + 1}\n`);
    chunks.push('0000000000 65535 f \n');

    for (let objectNumber = 1; objectNumber <= lastObjectNumber; objectNumber += 1) {
        chunks.push(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`);
    }

    chunks.push(
        `trailer\n<< /Size ${lastObjectNumber + 1} /Root 1 0 R /Info << /CoverLetterDesign (${escapePdfString(resolved.design)}) /CoverLetterFont (${escapePdfString(resolved.font)}) >> >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    );

    return stringToLatin1Bytes(chunks.join(''));
}

function stringToLatin1Bytes(text) {
    const bytes = new Uint8Array(text.length);

    for (let index = 0; index < text.length; index += 1) {
        bytes[index] = text.charCodeAt(index) & 0xff;
    }

    return bytes;
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

export function downloadCoverLetterPdf({
    text,
    fileName,
    profile = null,
    job = null,
    design = null,
    font = null,
} = {}) {
    const resolvedProfile = profile?.profile || profile || null;
    const bytes = buildCoverLetterPdfBytes(text, {
        profile: resolvedProfile,
        job,
        design: design ?? resolvedProfile?.cover_letter_design,
        font: font ?? resolvedProfile?.cover_letter_font,
    });
    const base64 = arrayBufferToBase64(bytes);

    triggerBrowserDownload({
        base64,
        fileName,
        mimeType: 'application/pdf',
    });
}
