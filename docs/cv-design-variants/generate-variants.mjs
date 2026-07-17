/**
 * One-shot generator for CV design preview HTML.
 * Run: node docs/cv-design-variants/generate-variants.mjs
 *
 * Sample data mirrors profile shape used by CoverLetterPdfBuilder +
 * CvFormattedTextBuilder (full_name, headline, summary, skills, experience, education).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sample = {
    full_name: 'James Mitchell',
    headline: 'Senior Laravel Developer',
    email: 'james.mitchell@example.com',
    phone: '+44 7837 370669',
    location: 'London, United Kingdom',
    linkedin: 'linkedin.com/in/james-mitchell',
    website: 'jamesmitchell.dev',
    summary:
        'Backend engineer specialising in Laravel APIs, Vue frontends, and PostgreSQL at scale. Comfortable owning delivery from schema design through production observability.',
    skills: ['PHP', 'Laravel', 'Vue', 'PostgreSQL', 'Redis', 'Docker', 'AWS', 'Inertia'],
    experience: [
        {
            title: 'Senior Software Engineer',
            company: 'Riverbank Systems',
            location: 'London',
            dates: 'Mar 2021 - Present',
            highlights: [
                'Led migration of monolith to Laravel microservices serving 40k daily users',
                'Built internal admin tooling with Vue 3 and Inertia',
                'Cut p95 API latency 35% via query redesign and Redis caching',
            ],
        },
        {
            title: 'PHP Developer',
            company: 'Coastal Digital',
            location: 'Bristol',
            dates: 'Jul 2018 - Feb 2021',
            highlights: [
                'Shipped client portals and payment flows on Laravel and MySQL',
                'Introduced CI, code review, and staging environments for a 6-person team',
            ],
        },
    ],
    education: [
        {
            degree: 'BSc Computer Science',
            institution: 'University of Bristol',
            dates: '2015 - 2018',
        },
    ],
};

const variants = [
    {
        id: '01',
        slug: 'teal-masthead',
        title: 'Teal Masthead',
        blurb: 'Full-width teal header band, white Clash name, clean single-column body.',
    },
    {
        id: '02',
        slug: 'ink-sidebar',
        title: 'Ink Sidebar',
        blurb: 'Dark charcoal left rail for contact and skills; light main column for experience.',
    },
    {
        id: '03',
        slug: 'swiss-rules',
        title: 'Swiss Rules',
        blurb: 'Ultra-minimal black/white with hairline rules and oversized Clash Display name.',
    },
    {
        id: '04',
        slug: 'forest-rail',
        title: 'Forest Rail',
        blurb: 'Deep green left accent rail, refined single column, muted sage chips.',
    },
    {
        id: '05',
        slug: 'coral-timeline',
        title: 'Coral Timeline',
        blurb: 'Vertical timeline experience with coral markers and warm charcoal type.',
    },
    {
        id: '06',
        slug: 'asymmetric-split',
        title: 'Asymmetric Split',
        blurb: 'Wide Clash name left, stacked contact right, then two-column skills/experience.',
    },
    {
        id: '07',
        slug: 'slate-bands',
        title: 'Slate Bands',
        blurb: 'Soft slate section bands (not cards), strong section labels in Clash Display.',
    },
    {
        id: '08',
        slug: 'mono-bold',
        title: 'Mono Bold',
        blurb: 'High-contrast black and white, mega Clash type, dense modern hierarchy.',
    },
    {
        id: '09',
        slug: 'ocean-wash',
        title: 'Ocean Wash',
        blurb: 'Cool blue header wash into white body, airy spacing, navy accents.',
    },
    {
        id: '10',
        slug: 'geometric-mark',
        title: 'Geometric Mark',
        blurb: 'Large Clash monogram mark, modern portfolio layout with accent underlines.',
    },
];

function esc(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function skillsHtml(className = 'skills') {
    return `<ul class="${className}">${sample.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
}

function experienceHtml(opts = {}) {
    const { timeline = false } = opts;

    return sample.experience
        .map(
            (role) => `
      <article class="role${timeline ? ' role--timeline' : ''}">
        <header class="role__head">
          <h3 class="role__title">${esc(role.title)}</h3>
          <p class="role__meta"><span class="role__company">${esc(role.company)}</span><span class="role__sep">·</span><span>${esc(role.location)}</span><span class="role__sep">·</span><span class="role__dates">${esc(role.dates)}</span></p>
        </header>
        <ul class="role__highlights">
          ${role.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}
        </ul>
      </article>`,
        )
        .join('');
}

function educationHtml() {
    return sample.education
        .map(
            (ed) => `
      <article class="edu">
        <h3 class="edu__degree">${esc(ed.degree)}</h3>
        <p class="edu__meta">${esc(ed.institution)} · ${esc(ed.dates)}</p>
      </article>`,
        )
        .join('');
}

function contactInline() {
    return [sample.email, sample.phone, sample.location, sample.linkedin, sample.website]
        .map((v) => esc(v))
        .join(' · ');
}

function contactList(className = 'contact-list') {
    const items = [
        ['Email', sample.email],
        ['Phone', sample.phone],
        ['Location', sample.location],
        ['LinkedIn', sample.linkedin],
        ['Web', sample.website],
    ];

    return `<ul class="${className}">${items.map(([k, v]) => `<li><span class="label">${esc(k)}</span><span>${esc(v)}</span></li>`).join('')}</ul>`;
}

const styles = {
    '01': `
    :root { --ink: #102a2a; --muted: #4a6666; --accent: #0d9488; --band: #0f766e; --paper: #ffffff; --line: #d5e5e3; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); color: var(--ink); background: #e8ecec; }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); box-shadow: 0 12px 40px rgba(16,42,42,.12); overflow: hidden; }
    .masthead { background: linear-gradient(135deg, #0f766e 0%, #115e59 55%, #134e4a 100%); color: #fff; padding: 36px 40px 32px; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 42px; letter-spacing: -0.03em; line-height: 1; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 16px; margin-top: 10px; opacity: .92; letter-spacing: .02em; }
    .contact { margin-top: 18px; font-size: 12px; line-height: 1.5; opacity: .88; max-width: 52ch; }
    .body { padding: 28px 40px 40px; }
    .section { margin-top: 22px; }
    .section:first-child { margin-top: 0; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid var(--line); }
    .summary { font-size: 13.5px; line-height: 1.55; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
    .skills li { font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 999px; background: #f0fafa; color: var(--band); border: 1px solid #cce5e2; }
    .role { margin-top: 14px; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; letter-spacing: -0.02em; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; opacity: .5; }
    .role__highlights { margin: 8px 0 0 18px; font-size: 12.5px; line-height: 1.45; color: var(--ink); }
    .role__highlights li { margin-bottom: 4px; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '02': `
    :root { --ink: #f4f1ec; --side: #1c1f26; --paper: #fafaf8; --muted: #9aa0ab; --accent: #e8a87c; --body: #22262e; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #d9dce3; color: var(--body); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; display: grid; grid-template-columns: 72mm minmax(0, 1fr); background: var(--paper); box-shadow: 0 12px 40px rgba(28,31,38,.18); }
    .sidebar { background: var(--side); color: var(--ink); padding: 36px 22px 32px; min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 28px; letter-spacing: -0.03em; line-height: 1.05; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 13px; color: var(--accent); margin-top: 10px; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
    .side-block { margin-top: 28px; min-width: 0; max-width: 100%; }
    .side-block h2 { font-family: var(--font-display); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
    .contact-list { list-style: none; font-size: 11.5px; line-height: 1.35; min-width: 0; max-width: 100%; }
    .contact-list li { margin-bottom: 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
    .contact-list .label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .contact-list li > span:not(.label) { display: block; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
    .skills { list-style: none; display: flex; flex-direction: column; gap: 7px; font-size: 12px; min-width: 0; }
    .skills li { padding-left: 10px; border-left: 2px solid var(--accent); overflow-wrap: anywhere; word-break: break-word; }
    .main { padding: 36px 32px 40px; min-width: 0; max-width: 100%; overflow-wrap: break-word; word-break: break-word; }
    .summary, .role__title, .role__meta, .role__highlights, .edu__degree, .edu__meta { overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
    .section { margin-top: 24px; }
    .section:first-child { margin-top: 0; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 10px; color: var(--side); }
    .summary { font-size: 13px; line-height: 1.55; color: #4a5160; }
    .role { margin-top: 14px; padding-bottom: 14px; border-bottom: 1px solid #e4e6eb; }
    .role:last-child { border-bottom: 0; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: #6b7280; margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: #6b7280; margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '03': `
    :root { --ink: #111111; --muted: #555; --line: #111; --paper: #fff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #ececec; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); padding: 40px 44px; box-shadow: 0 8px 28px rgba(0,0,0,.08); }
    .top { display: grid; grid-template-columns: 1.4fr .8fr; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid var(--line); }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 48px; letter-spacing: -0.045em; line-height: .95; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 15px; margin-top: 14px; letter-spacing: .04em; text-transform: uppercase; }
    .contact { font-size: 11.5px; line-height: 1.55; text-align: right; color: var(--muted); align-self: end; }
    .section { margin-top: 22px; display: grid; grid-template-columns: 28mm 1fr; gap: 18px; padding-top: 18px; border-top: 1px solid #ccc; }
    .section:first-of-type { border-top: 0; padding-top: 0; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
    .summary { font-size: 13px; line-height: 1.55; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 0 14px; font-size: 12.5px; }
    .skills li { position: relative; }
    .skills li:not(:last-child)::after { content: '/'; margin-left: 14px; color: #aaa; }
    .role { margin-bottom: 14px; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .role__meta { font-size: 11.5px; color: var(--muted); margin-top: 2px; letter-spacing: .02em; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 7px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 14px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '04': `
    :root { --ink: #1a2e24; --muted: #5a6f64; --accent: #1f6b4a; --chip: #e7f2ec; --paper: #fff; --rail: #163d2c; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #dfe8e3; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); display: grid; grid-template-columns: 10px 1fr; box-shadow: 0 12px 36px rgba(22,61,44,.12); }
    .rail { background: linear-gradient(180deg, var(--rail), #1f6b4a); }
    .inner { padding: 36px 40px 40px; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 40px; letter-spacing: -0.035em; line-height: 1; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 15px; color: var(--accent); margin-top: 8px; }
    .contact { margin-top: 14px; font-size: 12px; color: var(--muted); line-height: 1.5; }
    .section { margin-top: 24px; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
    .summary { font-size: 13.5px; line-height: 1.55; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
    .skills li { font-size: 12px; font-weight: 500; background: var(--chip); color: var(--rail); padding: 6px 12px; border-radius: 4px; }
    .role { margin-top: 14px; padding-left: 14px; border-left: 3px solid #c5ddd0; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '05': `
    :root { --ink: #1f1a17; --muted: #6a5f57; --accent: #e06a4e; --line: #eadfd6; --paper: #fffaf7; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #e7ddd4; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); padding: 36px 40px 40px; box-shadow: 0 12px 36px rgba(31,26,23,.1); }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 44px; letter-spacing: -0.04em; line-height: .95; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 15px; color: var(--accent); margin-top: 10px; }
    .contact { margin-top: 12px; font-size: 12px; color: var(--muted); }
    .section { margin-top: 26px; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 12px; color: var(--ink); }
    .summary { font-size: 13.5px; line-height: 1.55; color: var(--muted); max-width: 62ch; }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
    .skills li { font-size: 12px; border: 1px solid var(--accent); color: var(--accent); padding: 5px 10px; border-radius: 999px; font-weight: 500; }
    .timeline { position: relative; padding-left: 22px; }
    .timeline::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 2px; background: var(--line); }
    .role--timeline { position: relative; margin-bottom: 18px; }
    .role--timeline::before { content: ''; position: absolute; left: -22px; top: 7px; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px #fffaf7; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '06': `
    :root { --ink: #151821; --muted: #5c6475; --accent: #2563eb; --soft: #eef2ff; --paper: #fff; --line: #e5e7ef; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #dfe3ee; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); padding: 36px 40px 40px; box-shadow: 0 12px 40px rgba(21,24,33,.12); }
    .hero { display: grid; grid-template-columns: 1.55fr .85fr; gap: 20px; align-items: end; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 46px; letter-spacing: -0.045em; line-height: .92; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 15px; margin-top: 12px; color: var(--accent); }
    .contact-stack { font-size: 11.5px; line-height: 1.6; color: var(--muted); text-align: right; }
    .grid { margin-top: 22px; display: grid; grid-template-columns: 62mm 1fr; gap: 28px; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 10px; }
    .summary { font-size: 13px; line-height: 1.55; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .skills li { font-size: 12.5px; background: var(--soft); color: #1e3a8a; padding: 8px 10px; border-radius: 6px; font-weight: 500; }
    .role { margin-bottom: 16px; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu { margin-top: 8px; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 14px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .aside .section { margin-top: 22px; }
    .aside .section:first-child { margin-top: 0; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '07': `
    :root { --ink: #1e293b; --muted: #64748b; --accent: #0f172a; --band: #f1f5f9; --paper: #fff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #cbd5e1; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); padding: 32px 34px 36px; box-shadow: 0 12px 36px rgba(15,23,42,.12); }
    .header { padding: 8px 6px 20px; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 40px; letter-spacing: -0.035em; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 15px; margin-top: 6px; color: var(--muted); }
    .contact { margin-top: 12px; font-size: 12px; color: var(--muted); }
    .band { background: var(--band); border-radius: 10px; padding: 16px 18px; margin-top: 14px; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 8px; color: var(--accent); }
    .summary { font-size: 13.5px; line-height: 1.55; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
    .skills li { font-size: 12px; font-weight: 500; background: #fff; border: 1px solid #dbe3ee; padding: 6px 11px; border-radius: 6px; }
    .role { margin-top: 12px; }
    .role:first-of-type { margin-top: 0; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '08': `
    :root { --ink: #0a0a0a; --muted: #444; --paper: #fff; --invert: #0a0a0a; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #bbb; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); box-shadow: 0 10px 30px rgba(0,0,0,.2); }
    .blackout { background: var(--invert); color: #fff; padding: 34px 40px 28px; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 52px; letter-spacing: -0.05em; line-height: .9; text-transform: uppercase; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 14px; margin-top: 14px; letter-spacing: .2em; text-transform: uppercase; opacity: .85; }
    .contact { margin-top: 16px; font-size: 12px; opacity: .75; }
    .body { padding: 28px 40px 40px; }
    .section { margin-top: 22px; }
    .section__title { font-family: var(--font-display); font-weight: 700; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 10px; display: inline-block; background: #0a0a0a; color: #fff; padding: 4px 10px; }
    .summary { font-size: 13.5px; line-height: 1.5; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; font-weight: 500; }
    .skills li { text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
    .role { margin-top: 14px; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 17px; letter-spacing: -0.02em; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; text-transform: uppercase; letter-spacing: .03em; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '09': `
    :root { --ink: #0b1f33; --muted: #4d647a; --accent: #1d4e89; --wash: #dceaf7; --paper: #fff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #c9d7e6; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); overflow: hidden; box-shadow: 0 12px 40px rgba(11,31,51,.14); }
    .wash { background: linear-gradient(180deg, #dceaf7 0%, #eef5fb 55%, #ffffff 100%); padding: 40px 40px 28px; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 42px; letter-spacing: -0.035em; line-height: 1; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 16px; margin-top: 10px; color: var(--accent); }
    .contact { margin-top: 14px; font-size: 12px; color: var(--muted); max-width: 55ch; }
    .body { padding: 8px 40px 40px; }
    .section { margin-top: 22px; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
    .summary { font-size: 13.5px; line-height: 1.55; color: var(--muted); }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
    .skills li { font-size: 12px; font-weight: 500; background: var(--wash); color: var(--accent); padding: 6px 12px; border-radius: 999px; }
    .role { margin-top: 14px; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
    '10': `
    :root { --ink: #12141a; --muted: #5b6170; --accent: #c45c26; --soft: #f7f3ef; --paper: #fff; --mark: #1a1d26; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-body); background: #ddd6ce; color: var(--ink); }
    .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper); padding: 36px 40px 40px; box-shadow: 0 12px 40px rgba(18,20,26,.12); }
    .top { display: grid; grid-template-columns: 78px 1fr; gap: 20px; align-items: center; padding-bottom: 22px; border-bottom: 3px solid var(--mark); }
    .mark { width: 78px; height: 78px; border-radius: 18px; background: var(--mark); color: #fff; display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; font-size: 28px; letter-spacing: -0.04em; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 36px; letter-spacing: -0.035em; line-height: 1; }
    .headline { font-family: var(--font-display); font-weight: 500; font-size: 14px; margin-top: 8px; color: var(--accent); }
    .contact { margin-top: 8px; font-size: 12px; color: var(--muted); }
    .section { margin-top: 22px; }
    .section__title { font-family: var(--font-display); font-weight: 600; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 10px; display: inline-block; border-bottom: 3px solid var(--accent); padding-bottom: 3px; }
    .summary { font-size: 13.5px; line-height: 1.55; color: var(--muted); background: var(--soft); padding: 14px 16px; border-radius: 10px; }
    .skills { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
    .skills li { font-size: 12px; font-weight: 500; background: var(--mark); color: #fff; padding: 6px 11px; border-radius: 6px; }
    .role { margin-top: 14px; }
    .role__title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
    .role__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    .role__sep { margin: 0 6px; }
    .role__highlights { margin: 8px 0 0 16px; font-size: 12.5px; line-height: 1.45; }
    .edu__degree { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
    .edu__meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  `,
};

function shell(variant, body, extraHead = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CV Variant ${variant.id} - ${esc(variant.title)}</title>
  <link rel="stylesheet" href="shared/fonts.css" />
  <style>${styles[variant.id]}</style>
  ${extraHead}
</head>
<body>
  <main class="page" aria-label="CV preview ${esc(variant.title)}">
${body}
  </main>
</body>
</html>
`;
}

function bodyFor(variant) {
    switch (variant.id) {
        case '01':
            return `
    <header class="masthead">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contactInline()}</p>
    </header>
    <div class="body">
      <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
      <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
      <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
      <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>
    </div>`;
        case '02':
            return `
    <aside class="sidebar">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <div class="side-block"><h2>Contact</h2>${contactList()}</div>
      <div class="side-block"><h2>Skills</h2>${skillsHtml()}</div>
    </aside>
    <div class="main">
      <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
      <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
      <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>
    </div>`;
        case '03':
            return `
    <header class="top">
      <div>
        <h1 class="name">${esc(sample.full_name)}</h1>
        <p class="headline">${esc(sample.headline)}</p>
      </div>
      <p class="contact">${[sample.email, sample.phone, sample.location, sample.linkedin, sample.website].map(esc).join('<br />')}</p>
    </header>
    <section class="section"><h2 class="section__title">Profile</h2><p class="summary">${esc(sample.summary)}</p></section>
    <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
    <section class="section"><h2 class="section__title">Work</h2><div>${experienceHtml()}</div></section>
    <section class="section"><h2 class="section__title">Study</h2><div>${educationHtml()}</div></section>`;
        case '04':
            return `
    <div class="rail" aria-hidden="true"></div>
    <div class="inner">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contactInline()}</p>
      <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
      <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
      <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
      <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>
    </div>`;
        case '05':
            return `
    <h1 class="name">${esc(sample.full_name)}</h1>
    <p class="headline">${esc(sample.headline)}</p>
    <p class="contact">${contactInline()}</p>
    <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
    <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
    <section class="section"><h2 class="section__title">Experience</h2><div class="timeline">${experienceHtml({ timeline: true })}</div></section>
    <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>`;
        case '06':
            return `
    <header class="hero">
      <div>
        <h1 class="name">${esc(sample.full_name)}</h1>
        <p class="headline">${esc(sample.headline)}</p>
      </div>
      <div class="contact-stack">${[sample.email, sample.phone, sample.location, sample.linkedin, sample.website].map(esc).join('<br />')}</div>
    </header>
    <div class="grid">
      <aside class="aside">
        <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
        <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>
      </aside>
      <div>
        <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
        <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
      </div>
    </div>`;
        case '07':
            return `
    <header class="header">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contactInline()}</p>
    </header>
    <section class="band"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
    <section class="band"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
    <section class="band"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
    <section class="band"><h2 class="section__title">Education</h2>${educationHtml()}</section>`;
        case '08':
            return `
    <header class="blackout">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contactInline()}</p>
    </header>
    <div class="body">
      <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
      <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
      <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
      <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>
    </div>`;
        case '09':
            return `
    <header class="wash">
      <h1 class="name">${esc(sample.full_name)}</h1>
      <p class="headline">${esc(sample.headline)}</p>
      <p class="contact">${contactInline()}</p>
    </header>
    <div class="body">
      <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
      <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
      <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
      <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>
    </div>`;
        case '10':
            return `
    <header class="top">
      <div class="mark" aria-hidden="true">JM</div>
      <div>
        <h1 class="name">${esc(sample.full_name)}</h1>
        <p class="headline">${esc(sample.headline)}</p>
        <p class="contact">${contactInline()}</p>
      </div>
    </header>
    <section class="section"><h2 class="section__title">Summary</h2><p class="summary">${esc(sample.summary)}</p></section>
    <section class="section"><h2 class="section__title">Skills</h2>${skillsHtml()}</section>
    <section class="section"><h2 class="section__title">Experience</h2>${experienceHtml()}</section>
    <section class="section"><h2 class="section__title">Education</h2>${educationHtml()}</section>`;
        default:
            throw new Error(`Unknown variant ${variant.id}`);
    }
}

function indexHtml() {
    const cards = variants
        .map(
            (v) => `
      <a class="card" href="${v.id}-${v.slug}.html">
        <span class="num">${v.id}</span>
        <span class="title">${esc(v.title)}</span>
        <span class="blurb">${esc(v.blurb)}</span>
      </a>`,
        )
        .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CV Design Variants - Gallery</title>
  <link rel="stylesheet" href="shared/fonts.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-body);
      color: #141820;
      min-height: 100vh;
      background:
        radial-gradient(900px 420px at 10% -10%, rgba(15,118,110,.18), transparent 55%),
        radial-gradient(700px 380px at 90% 0%, rgba(37,99,235,.12), transparent 50%),
        #f4f5f7;
      padding: 48px 24px 72px;
    }
    .wrap { max-width: 960px; margin: 0 auto; }
    h1 {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: clamp(2rem, 4vw, 3rem);
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .lede { margin-top: 14px; max-width: 58ch; color: #4b5565; font-size: 15px; line-height: 1.55; }
    .note { margin-top: 10px; font-size: 13px; color: #6b7280; }
    .grid {
      margin-top: 36px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-decoration: none;
      color: inherit;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 18px 18px 20px;
      transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: #0f766e;
      box-shadow: 0 12px 28px rgba(15,23,42,.08);
    }
    .num {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 28px;
      letter-spacing: -0.03em;
      color: #0f766e;
    }
    .title {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .blurb { font-size: 13px; line-height: 1.45; color: #5b6472; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>CV design variants</h1>
    <p class="lede">Ten preview layouts using Clash Display for name and section headings. Same sample profile data in each. Pick a winner and we will wire it into production CV PDF generation.</p>
    <p class="note">Sample person: James Mitchell (from Auto Apply test personas). Open any card - fonts load from Fontshare (needs network).</p>
    <div class="grid">${cards}
    </div>
  </div>
</body>
</html>
`;
}

function readme() {
    const list = variants.map((v) => `- **${v.id} ${v.title}** (\`${v.id}-${v.slug}.html\`) - ${v.blurb}`).join('\n');

    return `# CV design variants

Preview gallery of **10 stylish CV layouts** for Auto Apply / profile CV generation.

## How production CVs work today

Auto Apply attaches the user's uploaded CV document (\`GET_CV_DOCUMENT\`). Test-persona and some generated PDFs use \`CoverLetterPdfBuilder\` with Helvetica and plain text from \`CvFormattedTextBuilder\` (profile fields: name, headline, summary, skills, experience, education).

These HTML previews use that same field shape so a chosen design can later be wired into HTML→PDF (or an upgraded PDF builder) without inventing a parallel content model.

## How to open

From the repo root:

\`\`\`bash
# Option A - open the gallery in your browser (double-click or):
open docs/cv-design-variants/index.html

# Option B - tiny local server (helps if a browser blocks CDN fonts on file://)
npx --yes serve docs/cv-design-variants
\`\`\`

Then open the printed URL (usually \`http://localhost:3000\`) and click a variant.

## Fonts

- **Clash Display** - headings / name (Fontshare / Indian Type Foundry)
- **Satoshi** - body text (Fontshare companion pair)

Loaded via Fontshare CSS API in \`shared/fonts.css\`. License: ITF Free Font License (personal and commercial use; confirm at [fontshare.com/fonts/clash-display](https://www.fontshare.com/fonts/clash-display) before shipping to production).

Regenerate HTML after editing \`generate-variants.mjs\`:

\`\`\`bash
node docs/cv-design-variants/generate-variants.mjs
\`\`\`

## Variants

${list}

## Next step

Tell us which number (01-10) you prefer. That design will be wired into production CV generation - these previews are not live in Auto Apply yet.
`;
}

for (const variant of variants) {
    const file = path.join(__dirname, `${variant.id}-${variant.slug}.html`);
    fs.writeFileSync(file, shell(variant, bodyFor(variant)));
    console.log('wrote', path.basename(file));
}

fs.writeFileSync(path.join(__dirname, 'index.html'), indexHtml());
console.log('wrote index.html');

fs.writeFileSync(path.join(__dirname, 'README.md'), readme());
console.log('wrote README.md');

// Keep a machine-readable list for later wiring
fs.writeFileSync(
    path.join(__dirname, 'variants.json'),
    JSON.stringify(
        {
            sample_profile_source: 'tests/fixtures/auto-apply/test-personas.json#uk_software',
            fonts: {
                display: 'Clash Display',
                body: 'Satoshi',
                source: 'https://www.fontshare.com/fonts/clash-display',
                css: 'shared/fonts.css',
            },
            production_hooks: [
                'App\\Services\\CoverLetterPdfBuilder',
                'App\\Support\\CvFormattedTextBuilder',
                'App\\Support\\TestPersonaCvFixtures',
            ],
            variants,
        },
        null,
        2,
    ) + '\n',
);
console.log('wrote variants.json');
