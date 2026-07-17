export const COVER_LETTER_SETTING_RANDOM = 'random';

export interface CoverLetterPreviewDesign {
    id: string;
    slug: string;
    title: string;
    blurb: string;
    accent: string;
    css: string;
}

export interface CoverLetterPreviewFont {
    key: string;
    label: string;
    display: string;
    body: string;
    stylesheet: string;
}

export interface CoverLetterPreviewSample {
    full_name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    linkedin_url?: string;
    website_url?: string;
    company: string;
    job_title: string;
    date: string;
    greeting: string;
    paragraphs: string[];
    signoff: string;
}

export interface CoverLetterDesignOptions {
    default_design: string;
    default_font: string;
    designs: CoverLetterPreviewDesign[];
    fonts: CoverLetterPreviewFont[];
    sample: CoverLetterPreviewSample;
}

function esc(value: string): string {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function looksLikePhone(value: string): boolean {
    const trimmed = value.trim();
    const digits = trimmed.replace(/\D+/g, '');

    return (
        digits.length >= 7 &&
        digits.length <= 15 &&
        /^[\d\s\-+().]+$/.test(trimmed)
    );
}

function normalizePhoneHref(value: string): string {
    const trimmed = value.trim();

    if (trimmed.includes('+')) {
        return `+${trimmed.replace(/\D+/g, '')}`;
    }

    return trimmed.replace(/\D+/g, '');
}

function hrefForUrl(value: string): string | null {
    const trimmed = value.trim();

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

function hrefForContactValue(value: string): string | null {
    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    if (/^\S+@\S+\.\S+$/.test(trimmed)) {
        return `mailto:${trimmed}`;
    }

    if (looksLikePhone(trimmed)) {
        return `tel:${normalizePhoneHref(trimmed)}`;
    }

    return hrefForUrl(trimmed);
}

function contactAnchor(value: string, linkable = true): string {
    const trimmed = String(value || '').trim();
    const escaped = esc(trimmed);

    if (!linkable) {
        return escaped;
    }

    const href = hrefForContactValue(trimmed);

    if (!href) {
        return escaped;
    }

    return `<a href="${esc(href)}">${escaped}</a>`;
}

function findTextLinkMatches(
    text: string,
): Array<{ start: number; end: number; href: string }> {
    const candidates: Array<{ start: number; end: number; href: string }> = [];

    for (const match of text.matchAll(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    )) {
        if (match.index === undefined) {
            continue;
        }

        candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            href: `mailto:${match[0]}`,
        });
    }

    for (const match of text.matchAll(
        /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:linkedin|github)\.com\/[^\s<>()]+/gi,
    )) {
        if (match.index === undefined) {
            continue;
        }

        let end = match.index + match[0].length;

        while (end > match.index && '.,);'.includes(text[end - 1] ?? '')) {
            end -= 1;
        }

        const token = text.slice(match.index, end);
        const href = hrefForUrl(token);

        if (href) {
            candidates.push({ start: match.index, end, href });
        }
    }

    for (const match of text.matchAll(/(?<![\w@])(?:\+?\d[\d\s().-]{6,}\d)/g)) {
        if (match.index === undefined) {
            continue;
        }

        const token = match[0].trim();

        if (!looksLikePhone(token)) {
            continue;
        }

        candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            href: `tel:${normalizePhoneHref(token)}`,
        });
    }

    candidates.sort((left, right) => left.start - right.start);

    const matches: Array<{ start: number; end: number; href: string }> = [];
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

function linkifyPlainText(text: string): string {
    const matches = findTextLinkMatches(text);

    if (matches.length === 0) {
        return esc(text);
    }

    let html = '';
    let cursor = 0;

    for (const match of matches) {
        if (match.start > cursor) {
            html += esc(text.slice(cursor, match.start));
        }

        html += `<a href="${esc(match.href)}">${esc(text.slice(match.start, match.end))}</a>`;
        cursor = match.end;
    }

    if (cursor < text.length) {
        html += esc(text.slice(cursor));
    }

    return html;
}

function contactParts(sample: CoverLetterPreviewSample): Array<{
    label: string;
    value: string;
    linkable: boolean;
}> {
    return [
        { label: 'Email', value: sample.email, linkable: true },
        { label: 'Phone', value: sample.phone, linkable: true },
        { label: 'Location', value: sample.location, linkable: false },
        {
            label: 'LinkedIn',
            value: sample.linkedin_url ?? '',
            linkable: true,
        },
        { label: 'Web', value: sample.website_url ?? '', linkable: true },
    ]
        .map((part) => ({ ...part, value: String(part.value || '').trim() }))
        .filter((part) => part.value);
}

function contactInline(sample: CoverLetterPreviewSample): string {
    return contactParts(sample)
        .map((part) => contactAnchor(part.value, part.linkable))
        .join(' · ');
}

function contactLines(sample: CoverLetterPreviewSample): string {
    return contactParts(sample)
        .map((part) => contactAnchor(part.value, part.linkable))
        .join('<br />');
}

function contactList(sample: CoverLetterPreviewSample): string {
    return `<ul class="contact-list">${contactParts(sample)
        .map(
            (part) =>
                `<li><span class="label">${esc(part.label)}</span><span>${contactAnchor(part.value, part.linkable)}</span></li>`,
        )
        .join('')}</ul>`;
}

function monogram(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}

function letterBody(sample: CoverLetterPreviewSample): string {
    const paragraphs = sample.paragraphs
        .map(
            (paragraph) =>
                `<p class="paragraph">${linkifyPlainText(paragraph)}</p>`,
        )
        .join('');

    return `
    <p class="meta-job">${esc(sample.job_title)} · ${esc(sample.company)}</p>
    <p class="date">${esc(sample.date)}</p>
    <p class="greeting">${esc(sample.greeting)}</p>
    ${paragraphs}
    <p class="signoff">${esc(sample.signoff)}<strong>${esc(sample.full_name)}</strong></p>`;
}

function bodyFor(slug: string, sample: CoverLetterPreviewSample): string {
    const contact = contactInline(sample);
    const lines = contactLines(sample);
    const letter = `<div class="letter">${letterBody(sample)}</div>`;

    switch (slug) {
        case 'ink-sidebar':
            return `
    <aside class="sidebar">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      ${contactList(sample)}
    </aside>
    ${letter}`;
        case 'swiss-rules':
            return `
    <header class="top">
      <div>
        <h1 class="name">${esc(sample.full_name)}</h1>
        <p class="headline">${esc(sample.headline)}</p>
      </div>
      <p class="contact">${lines}</p>
    </header>
    ${letter}`;
        case 'forest-rail':
            return `
    <div class="rail" aria-hidden="true"></div>
    <div class="inner">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contact}</p>
      ${letter}
    </div>`;
        case 'coral-timeline':
            return `
    <header class="header">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contact}</p>
    </header>
    ${letter}`;
        case 'asymmetric-split':
            return `
    <header class="hero">
      <div>
        <h1 class="name">${esc(sample.full_name)}</h1>
        <p class="headline">${esc(sample.headline)}</p>
      </div>
      <div class="contact-stack">${lines}</div>
    </header>
    ${letter}`;
        case 'slate-bands':
            return `
    <header class="header">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contact}</p>
    </header>
    ${letter}`;
        case 'mono-bold':
            return `
    <header class="blackout">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contact}</p>
    </header>
    ${letter}`;
        case 'ocean-wash':
            return `
    <header class="wash">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contact}</p>
    </header>
    ${letter}`;
        case 'geometric-mark':
            return `
    <header class="top">
      <div class="mark" aria-hidden="true">${esc(monogram(sample.full_name))}</div>
      <div>
        <h1 class="name">${esc(sample.full_name)}</h1>
        <p class="headline">${esc(sample.headline)}</p>
        <p class="contact">${contact}</p>
      </div>
    </header>
    ${letter}`;
        case 'teal-masthead':
        default:
            return `
    <header class="masthead">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contact}</p>
    </header>
    ${letter}`;
    }
}

export function buildCoverLetterPreviewHtml(
    design: CoverLetterPreviewDesign,
    font: CoverLetterPreviewFont,
    sample: CoverLetterPreviewSample,
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cover letter preview</title>
  <link rel="stylesheet" href="${esc(font.stylesheet)}" />
  <style>
    :root {
      --font-display: ${font.display};
      --font-body: ${font.body};
    }
    ${design.css}
    body { background: #e8ecec !important; }
    .page { transform-origin: top center; }
    a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  </style>
</head>
<body>
  <main class="page" aria-label="Cover letter preview ${esc(design.title)}">
${bodyFor(design.slug, sample)}
  </main>
</body>
</html>`;
}
