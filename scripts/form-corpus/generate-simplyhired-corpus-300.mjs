#!/usr/bin/env node
/**
 * Generate 300 SimplyHired Quick Apply synthetic fixtures (syn-sh-300-001 .. syn-sh-300-300).
 * Mirrors search, job detail, and Indeed Apply DOM from simplyhired-auto-apply.js.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const TOTAL = 300;
const PAGE_BASE = 'https://www.simplyhired.co.uk';
const INDEED_APPLY_BASE = 'https://smartapply.indeed.com/beta/indeedapply';

const ROLES = [
    'Software Engineer',
    'Senior Developer',
    'Full Stack Engineer',
    'DevOps Engineer',
    'Data Engineer',
    'Product Manager',
    'Business Analyst',
    'QA Engineer',
    'Cloud Architect',
    'Platform Engineer',
];

const COMPANIES = [
    'Acme Corp',
    'Globex',
    'Initech',
    'Umbrella Labs',
    'Stark Industries',
    'Wayne Enterprises',
    'Hooli',
    'Pied Piper',
    'Massive Dynamic',
    'Cyberdyne Systems',
];

const CITIES = ['London', 'Manchester', 'Birmingham', 'Bristol', 'Leeds', 'Edinburgh', 'Glasgow', 'Cardiff'];
const SKILL_OPTS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'SQL', 'React', 'AWS', 'Azure'];
const DEGREE_OPTS = ['GCSE', 'A-Level', 'Bachelor\'s degree', 'Master\'s degree', 'PhD', 'Other'];
const NOTICE_OPTS = ['Immediate', '1 week', '2 weeks', '1 month', '2 months', '3 months'];

/** @param {number} seed */
function createRng(seed) {
    let s = seed >>> 0;

    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
}

function pickN(rng, list, count) {
    const copy = [...list];
    const out = [];

    for (let i = 0; i < count && copy.length > 0; i += 1) {
        const idx = Math.floor(rng() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }

    return out;
}

function shShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en-GB">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<div id="__next">
<header data-testid="headerBarContainer">
<a data-testid="headerLogoLinkMain" href="/">SimplyHired</a>
</header>
<main>${body}</main>
</div>
</body>
</html>`;
}

function shSearchInputs(seq, role, city) {
    return `<form role="search">
<label data-testid="findKeywordFormLabel" for="field-q-${seq}">Job Title, Skills or Company</label>
<input data-testid="findJobsKeywordInput" id="field-q-${seq}" name="q" type="text" value="${role}">
<label data-testid="findLocationFormLabel" for="field-l-${seq}">Location</label>
<input data-testid="findJobsLocationInput" id="field-l-${seq}" name="l" type="text" value="${city}">
<button type="submit" data-testid="findJobsSearchSubmit">Search</button>
</form>`;
}

function shJobCard(seq, cardIndex, jobId, title, company, city, quickApply) {
    return `<li class="css-0"><div data-jobkey="${jobId}" data-testid="searchSerpJob" class="css-1inpap1">
<h2 data-testid="searchSerpJobTitle"><a href="/job/${jobId}">${title}</a></h2>
<p><span>${company}</span> - <span data-testid="searchSerpJobLocation">${city}</span></p>
${quickApply ? '<p data-testid="searchSerpJobQuickApply">Quick apply</p>' : ''}
</div></li>`;
}

function shJobDetailPanel(role, company, city, jobId, { quickApply = true, external = false } = {}) {
    const applyButton = external
        ? '<a href="https://careers.example.com/apply">Apply on company site</a>'
        : `<a class="chakra-button" data-testid="viewJobHeaderFooterApplyButton" href="/out?r=fixture-${jobId}">Apply</a>`;

    return `<section>
<div data-testid="viewJobHeadingContainer">
<h1 data-testid="viewJobTitle">${role}</h1>
<div data-testid="viewJobCompanyDetailsContainer">
<span data-testid="viewJobCompanyName">${company}</span>
<span data-testid="viewJobCompanyLocation">${city}</span>
</div>
</div>
<ul data-testid="viewJobShareApplyContainer">${applyButton}</ul>
<div data-testid="viewJobBodyContainer">
<div data-testid="viewJobBodyJobFullDescriptionContent">
<p>Join ${company} as a ${role.toLowerCase()} in ${city}. Build reliable software and collaborate across teams.</p>
</div>
</div>
${quickApply && !external ? `<iframe title="Job application form" src="${INDEED_APPLY_BASE}/form/contact?jl=${jobId}"></iframe>` : ''}
</section>`;
}

function indeedApplyShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en-GB">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<form data-testid="indeed-apply-form">${body}</form>
</body>
</html>`;
}

function iaField(label, seq, type = 'text', extra = '') {
    const slug = slugify(label).slice(0, 24);
    const id = `ia-field-${seq}-${slug}`;

    return `<div data-testid="input-${id}">
<label for="${id}" data-testid="${id}-label"><span data-testid="safe-markup">${label}</span></label>
<input type="${type}" id="${id}" name="${id}" data-testid="${id}-input" ${extra}>
</div>`;
}

function iaTextarea(label, seq, rows = 3) {
    const slug = slugify(label).slice(0, 24);
    const id = `ia-textarea-${seq}-${slug}`;

    return `<div data-testid="input-${id}">
<label for="${id}" data-testid="${id}-label"><span data-testid="safe-markup">${label}</span></label>
<textarea rows="${rows}" id="${id}" name="${id}" data-testid="${id}-input"></textarea>
</div>`;
}

function iaSelect(label, seq, options) {
    const slug = slugify(label).slice(0, 24);
    const id = `ia-select-${seq}-${slug}`;
    const opts = options.map((o) => `<option value="${slugify(o)}">${o}</option>`).join('');

    return `<div data-testid="input-${id}">
<label for="${id}" data-testid="${id}-label"><span data-testid="safe-markup">${label}</span></label>
<select id="${id}" name="${id}" data-testid="${id}-input">
<option value="">Select an option</option>${opts}
</select>
</div>`;
}

function iaRadioGroup(label, seq, options) {
    const name = `ia-radio-${seq}-${slugify(label).slice(0, 20)}`;

    return `<fieldset data-testid="input-${name}" role="radiogroup">
<legend data-testid="${name}-label"><span data-testid="safe-markup">${label}</span></legend>
${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${slugify(opt)}" data-testid="${name}-${i}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function iaLocationFields(seq) {
    return `<div data-testid="location-fields-country">
<span data-testid="location-fields-country-label">Country</span>
<span>United Kingdom</span>
</div>
<div>
<label for="location-fields-postal-code-input-${seq}" data-testid="location-fields-postal-code-label">Postcode</label>
<input data-testid="location-fields-postal-code-input" id="location-fields-postal-code-input-${seq}" name="location-postal-code" autocomplete="postal-code">
</div>
<div>
<label for="location-fields-locality-input-${seq}" data-testid="location-fields-locality-label">City, county</label>
<input type="text" role="combobox" data-testid="location-fields-locality-input" id="location-fields-locality-input-${seq}" name="location-locality" autocomplete="address-level2">
</div>
<div>
<label for="location-fields-address-input-${seq}" data-testid="location-fields-address-label">Street address</label>
<input data-testid="location-fields-address-input" id="location-fields-address-input-${seq}" name="location-address" autocomplete="street-address">
</div>`;
}

function iaContinue(label = 'Continue') {
    return `<button type="button" data-testid="indeed-apply-continue"><span>${label}</span></button>`;
}

function iaSubmit(label = 'Submit your application') {
    return `<button type="submit" data-testid="indeed-apply-submit"><span>${label}</span></button>`;
}

function addScenario(id, category, title, html, pageUrl, options = {}) {
    const filename = `${id}.html`;
    writeFileSync(join(HTML_DIR, filename), html);
    upsertScenario(manifest, {
        id,
        category,
        source: 'synthetic',
        status: 'pending',
        html_file: filename,
        page_url: pageUrl,
        page_title: title,
        notes: options.notes || `SimplyHired ${category} synthetic fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildJobSearch(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const cards = pickN(rng, [...ROLES], 8).map((title, cardIndex) => {
        const jobId = `SH${seq}${cardIndex}`;

        return shJobCard(seq, cardIndex, jobId, title, pick(rng, COMPANIES), city, rng() > 0.3);
    }).join('\n');
    const firstJobId = `SH${seq}0`;

    return {
        category: 'simplyhired-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${PAGE_BASE}/search?q=${encodeURIComponent(role)}&l=${encodeURIComponent(city)}&iafilter=1`,
        html: shShell(`${role} jobs in ${city}`, `
<section>
${shSearchInputs(seq, role, city)}
<ul role="list">${cards}</ul>
${shJobDetailPanel(role, pick(rng, COMPANIES), city, firstJobId)}
<nav data-testid="pageNumberContainer"><a data-testid="pageNumberBlockNext" href="/search?cursor=next">Next</a></nav>
</section>`),
    };
}

function buildJobDetail(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = `SHDETAIL${seq}`;

    return {
        category: 'simplyhired-job-detail',
        title: `${role} - ${company}`,
        pageUrl: `${PAGE_BASE}/job/${jobId}`,
        html: shShell(`${role} - ${company}`, shJobDetailPanel(role, company, city, jobId)),
    };
}

function buildJobDetailExternal(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = `SHEXT${seq}`;

    return {
        category: 'simplyhired-job-detail-external',
        title: `${role} - ${company}`,
        pageUrl: `${PAGE_BASE}/job/${jobId}`,
        html: shShell(`${role} - ${company}`, shJobDetailPanel(role, company, city, jobId, { quickApply: false, external: true })),
    };
}

function buildIndeedApplyContact(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'simplyhired-indeed-apply-contact',
        title: `Apply - ${role} - Contact info`,
        pageUrl: `${INDEED_APPLY_BASE}/form/contact?jl=${seq}`,
        html: indeedApplyShell(`Contact info - ${role}`, `
<h1 data-testid="contact-info-heading">Add contact information</h1>
${iaField('First name', seq, 'text', 'required autocomplete="given-name"')}
${iaField('Last name', seq, 'text', 'required autocomplete="family-name"')}
${iaField('Email address', seq, 'email', 'required autocomplete="email"')}
${iaField('Phone number', seq, 'tel', 'required autocomplete="tel"')}
${iaLocationFields(seq)}
${iaContinue()}`),
    };
}

function buildIndeedApplyQuestions(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'simplyhired-indeed-apply-questions',
        title: `Apply - ${role} - Employer questions`,
        pageUrl: `${INDEED_APPLY_BASE}/form/questions?jl=${seq}`,
        html: indeedApplyShell(`Questions - ${role}`, `
<h1 data-testid="questions-heading">Answer these questions from the employer</h1>
${iaSelect('What is the highest level of education you have completed?', seq, DEGREE_OPTS)}
${iaTextarea('Why are you interested in this role?', seq, 4)}
${iaRadioGroup('Are you authorized to work in the United Kingdom?', seq, ['Yes', 'No'])}
${iaRadioGroup('Will you require sponsorship now or in the future?', seq, ['Yes', 'No', 'Not sure'])}
${iaContinue()}`),
    };
}

function buildIndeedApplyScreening(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'simplyhired-indeed-apply-screening',
        title: `Apply - ${role} - Screening`,
        pageUrl: `${INDEED_APPLY_BASE}/form/screening?jl=${seq}`,
        html: indeedApplyShell(`Screening - ${role}`, `
<h1 data-testid="screening-heading">Screening questions</h1>
${iaRadioGroup('Do you have the right to work in the UK without sponsorship?', seq, ['Yes', 'No'])}
${iaSelect('Notice period', seq, NOTICE_OPTS)}
${iaField('Current salary (£)', seq, 'number', 'min="0" step="1000"')}
${iaField('Expected salary (£)', seq, 'number', 'min="0" step="1000"')}
${iaSelect('Years of experience in a similar role', seq, ['0-1', '1-3', '3-5', '5-10', '10+'])}
${iaCheckboxGroup('Which skills do you have?', seq, pickN(rng, SKILL_OPTS, 5))}
${iaContinue()}`),
    };
}

function iaCheckboxGroup(label, seq, options) {
    const name = `ia-check-${seq}-${slugify(label).slice(0, 20)}`;

    return `<fieldset data-testid="input-${name}">
<legend data-testid="${name}-label"><span data-testid="safe-markup">${label}</span></legend>
${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}" value="${slugify(opt)}" data-testid="${name}-${i}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function buildIndeedApplyReview(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'simplyhired-indeed-apply-review',
        title: `Apply - ${role} - Review`,
        pageUrl: `${INDEED_APPLY_BASE}/form/review?jl=${seq}`,
        html: indeedApplyShell(`Review - ${role}`, `
<h1 data-testid="review-heading">Review your application</h1>
<p>You are applying for <strong>${role}</strong> at <strong>${company}</strong>.</p>
${iaField('Confirm email address', seq, 'email', 'required')}
${iaField('Confirm phone number', seq, 'tel', 'required')}
${iaTextarea('Final comments for the recruiter (optional)', seq, 3)}
${iaRadioGroup('I agree to the privacy policy and terms', seq, ['I agree'])}
${iaSubmit()}`),
    };
}

function buildQuickApplyHost(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = `SHHOST${seq}`;

    return {
        category: 'simplyhired-quick-apply-host',
        title: `${role} at ${company} - Quick Apply open`,
        pageUrl: `${PAGE_BASE}/job/${jobId}`,
        html: shShell(`${role} - Quick Apply`, `
${shJobDetailPanel(role, company, city, jobId)}
<iframe title="Job application form" src="${INDEED_APPLY_BASE}/form/contact?jl=${seq}">
${indeedApplyShell('Contact', `${iaField('First name', seq, 'text', 'required')}${iaField('Last name', seq, 'text', 'required')}${iaContinue()}`)}
</iframe>`),
    };
}

function buildOverlaySearch(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const jobId = `SHOV${seq}`;

    return {
        category: 'simplyhired-overlay-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${PAGE_BASE}/search?q=${encodeURIComponent(role)}&l=${encodeURIComponent(city)}`,
        html: shShell(`${role} jobs`, `
<div id="onetrust-banner-sdk"><button type="button" id="onetrust-accept-btn-handler">Accept All Cookies</button></div>
<section>
${shSearchInputs(seq, role, city)}
<ul role="list">${shJobCard(seq, 0, jobId, role, pick(rng, COMPANIES), city, true)}</ul>
</section>`),
    };
}

/** @type {Array<(index: number, seq: number, rng: () => number) => object>} */
const BUILDERS = [
    buildJobSearch,
    buildJobDetail,
    buildJobDetailExternal,
    buildIndeedApplyContact,
    buildIndeedApplyQuestions,
    buildIndeedApplyScreening,
    buildIndeedApplyReview,
    buildQuickApplyHost,
    buildOverlaySearch,
];

const beforeCount = manifest.scenarios.length;
let generated = 0;

for (let i = 1; i <= TOTAL; i += 1) {
    const id = `syn-sh-300-${String(i).padStart(3, '0')}`;
    const builder = BUILDERS[(i - 1) % BUILDERS.length];
    const rng = createRng(i * 5113 + 17);
    const result = builder(i, 400_000 + i, rng);

    addScenario(id, result.category, result.title, result.html, result.pageUrl, {
        notes: `${result.category} SimplyHired synthetic fixture`,
    });
    generated += 1;
}

saveManifest(manifest);

console.log(`Generated ${generated} SimplyHired form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${beforeCount} -> ${manifest.scenarios.length} scenarios (${MANIFEST_PATH})`);
