#!/usr/bin/env node
/**
 * Generate 300 CV-Library Easy Apply synthetic fixtures (syn-cvl-300-001 .. syn-cvl-300-300).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const TOTAL = 300;
const PAGE_BASE = 'https://www.cv-library.co.uk';

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
    'Platform Recruitment',
    'Hays Recruitment',
    'Computer Futures',
    'Randstad',
    'Adecco',
    'Gi Group',
    'Huntress',
    'Office Angels',
    'Manpower',
    'Interaction recruitment',
];

const CITIES = ['London', 'Manchester', 'Birmingham', 'Bristol', 'Leeds', 'Edinburgh', 'Glasgow', 'Cardiff'];
const SKILL_OPTS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'SQL', 'React', 'AWS', 'Azure'];

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

function cvlShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en-GB">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<header><a href="/">CV-Library</a></header>
<main>${body}</main>
</body>
</html>`;
}

function cvlField(label, seq, type = 'text', extra = '') {
    const id = slugify(`${label}-${seq}`).slice(0, 32);

    return `<div class="form-group" data-qa="field-${id}">
<label for="${id}">${label}</label>
<input type="${type}" id="${id}" name="${id}" ${extra}>
</div>`;
}

function cvlTextarea(label, seq, rows = 4) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);

    return `<div class="form-group" data-qa="field-${id}">
<label for="${id}">${label}</label>
<textarea id="${id}" name="${id}" rows="${rows}"></textarea>
</div>`;
}

function cvlSelect(label, seq, options) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const opts = options.map((o) => `<option value="${slugify(o)}">${o}</option>`).join('');

    return `<div class="form-group" data-qa="field-${id}">
<label for="${id}">${label}</label>
<select id="${id}" name="${id}">
<option value="">Please select</option>${opts}
</select>
</div>`;
}

function cvlRadioGroup(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 28);

    return `<fieldset data-qa="fieldset-${name}">
<legend data-qa="application-step-subtitle">${label}</legend>
${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${slugify(opt)}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function cvlContinue(text = 'Next') {
    return `<button type="button" data-qa="submit-button">${text}</button>`;
}

function cvlSubmit(text = 'Submit application') {
    return `<button type="submit" data-qa="submit-button-apply">${text}</button>`;
}

function cvlApplyForm(stepTitle, inner, buttons = '') {
    return `<form data-qa="application-form" action="/job/apply/submit" method="post">
<h1 data-qa="application-step-title">${stepTitle}</h1>
${inner}
<div data-qa="application-actions">${buttons || `${cvlContinue()} ${cvlSubmit()}`}</div>
</form>`;
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
        notes: options.notes || `CV-Library ${category} synthetic fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildJobSearch(seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const cards = pickN(rng, ROLES, 6).map((title, cardIndex) => {
        const company = pick(rng, COMPANIES);
        const jobId = 225_000_000 + seq * 10 + cardIndex;
        const slug = slugify(title);
        const easyApply = cardIndex % 4 !== 3;

        return `<div class="JobCard_job__fixture" itemprop="itemListElement">
<h2 data-testid="job-card-title"><a data-qa="job-title-link" href="/job/${jobId}/${slug}">${title}</a></h2>
<p>Posted by <a data-qa="company-name-link"><span data-qa="job-card-company-link-1">${company}</span></a></p>
${easyApply ? '<span data-qa="easy-apply-chip">Easy Apply</span>' : ''}
<a data-qa="type-apply-now" href="/job/apply/${jobId}">Apply Now</a>
</div>`;
    }).join('\n');

    return {
        category: 'cvlibrary-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${PAGE_BASE}/${slugify(role)}-jobs-in-${slugify(city)}`,
        html: cvlShell(`${role} jobs in ${city}`, `
<form role="search">
<label for="keywords-${seq}">Keywords</label>
<input id="keywords-${seq}" name="q" type="search" value="${role}">
<label for="location-${seq}">Location</label>
<input id="location-${seq}" name="l" type="search" value="${city}">
<button type="submit">Find Jobs</button>
</form>
<section>${cards}</section>
<a data-qa="next" href="?page=2">Next</a>`),
    };
}

function buildJobDetail(seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = 225_000_000 + seq;
    const slug = slugify(role);

    return {
        category: 'cvlibrary-job-detail',
        title: `${role} - CV-Library`,
        pageUrl: `${PAGE_BASE}/job/${jobId}/${slug}`,
        html: cvlShell(`${role}`, `
<h1>${role}</h1>
<p>Posted by <a data-qa="company-name-link">${company}</a></p>
<p>${city}</p>
<span data-qa="easy-apply-chip">Easy Apply</span>
<div data-qa="job-description" class="JobDescription_fixture">
<p>We are hiring a ${role.toLowerCase()} at ${company} in ${city}.</p>
</div>
<a data-qa="type-apply-now" href="/job/apply/${jobId}">Apply Now</a>`),
    };
}

function buildApplicationPersonal(seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'cvlibrary-application-personal',
        title: `Apply - ${role}`,
        pageUrl: `${PAGE_BASE}/job/apply/${seq}`,
        html: cvlShell(`Apply - ${role}`, cvlApplyForm('Your details', `
${cvlField('First name', seq, 'text', 'required')}
${cvlField('Last name', seq, 'text', 'required')}
${cvlField('Email address', seq, 'email', 'required')}
${cvlField('Phone number', seq, 'tel', 'required')}
${cvlField('City', seq, 'text', 'required')}
`, cvlContinue('Next'))),
    };
}

function buildApplicationScreening(seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'cvlibrary-application-screening',
        title: `Apply - ${role} - Screening`,
        pageUrl: `${PAGE_BASE}/job/apply/${seq}`,
        html: cvlShell(`Apply - ${role}`, cvlApplyForm('Application questions', `
${cvlRadioGroup('Do you have the right to work in the UK?', seq, ['Yes', 'No'])}
${cvlSelect('Years of experience', seq, ['0-1', '1-3', '3-5', '5-10', '10+'])}
${cvlTextarea('Why are you interested in this role?', seq, 5)}
${cvlSelect('Notice period', seq, ['Immediate', '1 week', '2 weeks', '1 month', '2 months'])}
`, cvlContinue('Next'))),
    };
}

function buildApplicationReview(seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'cvlibrary-application-review',
        title: `Apply - ${role} - Review`,
        pageUrl: `${PAGE_BASE}/job/apply/${seq}`,
        html: cvlShell(`Apply - ${role}`, cvlApplyForm('Review your application', `
<div data-qa="application-review-summary">
<p>Please review your answers before submitting.</p>
<ul><li>Role: ${role}</li><li>CV attached</li></ul>
</div>
`, cvlSubmit())),
    };
}

function buildApplicationCombined(seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'cvlibrary-application-combined',
        title: `Apply - ${role}`,
        pageUrl: `${PAGE_BASE}/job/apply/${seq}`,
        html: cvlShell(`Apply - ${role}`, cvlApplyForm('Complete your application', `
${cvlField('First name', seq, 'text', 'required')}
${cvlField('Last name', seq, 'text', 'required')}
${cvlField('Email address', seq, 'email', 'required')}
${cvlTextarea('Cover letter', seq, 6)}
${cvlRadioGroup('Are you willing to work hybrid in London?', seq, ['Yes', 'No'])}
${cvlSelect('How did you hear about this job?', seq, ['CV-Library', 'LinkedIn', 'Referral', 'Other'])}
`, `${cvlContinue('Next')} ${cvlSubmit()}`)),
    };
}

/** @type {Array<(seq: number, rng: () => number) => object>} */
const BUILDERS = [
    buildApplicationPersonal,
    buildApplicationScreening,
    buildApplicationReview,
    buildApplicationCombined,
    buildJobDetail,
    buildJobSearch,
];

const beforeCount = manifest.scenarios.length;

for (let i = 1; i <= TOTAL; i += 1) {
    const id = `syn-cvl-300-${String(i).padStart(3, '0')}`;
    const builder = BUILDERS[(i - 1) % BUILDERS.length];
    const rng = createRng(i * 7919 + 99);
    const result = builder(225_000_000 + i, rng);

    addScenario(id, result.category, result.title, result.html, result.pageUrl);
}

saveManifest(manifest);

console.log(`Generated ${TOTAL} CV-Library form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${beforeCount} -> ${manifest.scenarios.length} scenarios (${MANIFEST_PATH})`);
