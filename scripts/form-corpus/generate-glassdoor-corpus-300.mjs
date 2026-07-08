#!/usr/bin/env node
/**
 * Generate 300 Glassdoor / Indeed Apply synthetic form fixtures (syn-gd-300-001 .. syn-gd-300-300).
 * Mirrors Easy Apply host DOM from glassdoor-auto-apply.js and Indeed Apply steps in smartapply iframes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const TOTAL = 300;
const GLASSDOOR_BASE = 'https://www.glassdoor.com';
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

const CITIES = ['London', 'Manchester', 'Birmingham', 'Bristol', 'Leeds', 'Edinburgh', 'Glasgow', 'Cardiff', 'Dublin', 'New York'];
const SKILL_OPTS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'SQL', 'React', 'AWS', 'Azure'];
const DEGREE_OPTS = ['GCSE or equivalent', 'A-Level', 'Bachelor\'s', 'Master\'s', 'PhD', 'Other'];
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

function glassdoorShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<header data-test="global-header"><a href="/">Glassdoor</a></header>
<main>${body}</main>
<footer><p>Glassdoor synthetic corpus fixture</p></footer>
</body>
</html>`;
}

function indeedApplyShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<form data-testid="indeed-apply-form">
${body}
</form>
</body>
</html>`;
}

function gdSearchInputs(seq, role, city) {
    return `<form role="search" data-test="job-search-form" action="/Job/jobs.htm" method="get">
<label for="keyword-${seq}">Find your perfect job</label>
<input id="keyword-${seq}" name="sc.keyword0" type="search" value="${role}" placeholder="Job title, keywords, or company" data-test="job-search-keyword">
<label for="location-${seq}">Location</label>
<input id="location-${seq}" name="locKeyword" type="search" value="${city}" placeholder="City, state, or zip" data-test="job-search-location">
<button type="submit" data-test="search-button">Search</button>
</form>`;
}

function gdJobCard(seq, cardIndex, title, company, city, easyApply) {
    const jobId = 101_002_800_000 + seq * 10 + cardIndex;

    return `<li data-test="jobListing" data-is-easy-apply="${easyApply ? 'true' : 'false'}"${cardIndex === 0 ? ' aria-current="true" data-selected="true"' : ''}>
<a data-test="job-link" href="/job-listing/job.htm?jl=${jobId}"><span data-test="job-title">${title}</span></a>
<span data-test="employer-name">${company}</span>
<span>${city}</span>
${easyApply ? '<span data-test="easyApply">Easy Apply</span>' : ''}
</li>`;
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
        notes: options.notes || `Glassdoor ${category} synthetic fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildJobSearch(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const cards = pickN(rng, [...ROLES], 8).map((title, cardIndex) => {
        return gdJobCard(seq, cardIndex, title, pick(rng, COMPANIES), city, rng() > 0.25);
    }).join('\n');

    return {
        category: 'glassdoor-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${GLASSDOOR_BASE}/Job/jobs.htm?sc.keyword0=${encodeURIComponent(role)}&locKeyword=${encodeURIComponent(city)}&applicationType=1`,
        html: glassdoorShell(`${role} jobs in ${city}`, `
<section data-test="job-search-results">
${gdSearchInputs(seq, role, city)}
<ul data-test="job-results">${cards}</ul>
<nav data-test="pagination"><a data-test="pagination-next" aria-label="Next" href="?p=2">Next</a></nav>
</section>`),
    };
}

function buildJobListing(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const cards = pickN(rng, [...ROLES], 10).map((title, cardIndex) => {
        return gdJobCard(seq, cardIndex, title, pick(rng, COMPANIES), city, true);
    }).join('\n');

    return {
        category: 'glassdoor-job-listing',
        title: `${role} - Glassdoor`,
        pageUrl: `${GLASSDOOR_BASE}/Job/jobs.htm?sc.keyword0=${encodeURIComponent(role)}`,
        html: glassdoorShell(role, `
<div class="split-view">
<aside data-test="job-list-panel"><ul>${cards}</ul></aside>
<section data-test="job-detail-panel">
<p>Select a job to view details.</p>
</section>
</div>`),
    };
}

function buildJobDetail(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = 101_002_800_000 + seq;

    return {
        category: 'glassdoor-job-detail',
        title: `${role} at ${company}`,
        pageUrl: `${GLASSDOOR_BASE}/job-listing/job.htm?jl=${jobId}`,
        html: glassdoorShell(`${role} at ${company}`, `
<article data-test="job-details">
<h1>${role}</h1>
<p data-test="employer-name">${company}</p>
<p>${city}</p>
<p>Join ${company} as a ${role.toLowerCase()}. You will design scalable systems, mentor engineers, and ship reliable product features.</p>
</article>
<section data-test="apply-section">
<button type="button" data-test="applyButton" aria-label="Easy Apply">Easy Apply</button>
</section>
<iframe title="Job application form" src="${INDEED_APPLY_BASE}/form/contact?jl=${jobId}" style="display:none"></iframe>`),
    };
}

function buildJobDetailExternal(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const jobId = 101_002_900_000 + seq;

    return {
        category: 'glassdoor-job-detail-external',
        title: `${role} at ${company}`,
        pageUrl: `${GLASSDOOR_BASE}/job-listing/job.htm?jl=${jobId}`,
        html: glassdoorShell(`${role} at ${company}`, `
<article data-test="job-details">
<h1>${role}</h1>
<p data-test="employer-name">${company}</p>
<p>External application required for this role.</p>
</article>
<a href="https://careers.example.com/apply/${jobId}" rel="noopener">Apply on company site</a>`),
    };
}

function buildIndeedApplyContact(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'glassdoor-indeed-apply-contact',
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
        category: 'glassdoor-indeed-apply-questions',
        title: `Apply - ${role} - Employer questions`,
        pageUrl: `${INDEED_APPLY_BASE}/form/questions?jl=${seq}`,
        html: indeedApplyShell(`Questions - ${role}`, `
<h1 data-testid="questions-heading">Answer these questions from the employer</h1>
<span data-testid="required-fields-legend">Fields marked with an asterisk (*) are required.</span>
${iaSelect('What is the highest level of education you have completed?', seq, DEGREE_OPTS)}
${iaTextarea('Why are you interested in this role?', seq, 4)}
${iaTextarea('Describe your experience relevant to this position', seq, 5)}
${iaRadioGroup('Are you authorized to work in the United Kingdom?', seq, ['Yes', 'No'])}
${iaRadioGroup('Will you require sponsorship now or in the future?', seq, ['Yes', 'No', 'Not sure'])}
${iaContinue()}`),
    };
}

function buildIndeedApplyScreening(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'glassdoor-indeed-apply-screening',
        title: `Apply - ${role} - Screening`,
        pageUrl: `${INDEED_APPLY_BASE}/form/screening?jl=${seq}`,
        html: indeedApplyShell(`Screening - ${role}`, `
<h1 data-testid="screening-heading">Screening questions</h1>
${iaRadioGroup('Do you have the right to work in the UK without sponsorship?', seq, ['Yes', 'No'])}
${iaSelect('Notice period', seq, NOTICE_OPTS)}
${iaField('Current salary (£)', seq, 'number', 'min="0" step="1000"')}
${iaField('Expected salary (£)', seq, 'number', 'min="0" step="1000"')}
${iaSelect('Years of experience in a similar role', seq, ['0-1', '1-3', '3-5', '5-10', '10+'])}
${iaRadioGroup('Are you willing to work on-site?', seq, ['Yes', 'No', 'Hybrid only'])}
${iaTextarea('Additional information for the hiring team', seq, 3)}
${iaContinue('Continue')}`),
    };
}

function buildIndeedApplyDocuments(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'glassdoor-indeed-apply-documents',
        title: `Apply - ${role} - Documents`,
        pageUrl: `${INDEED_APPLY_BASE}/form/documents?jl=${seq}`,
        html: indeedApplyShell(`Documents - ${role}`, `
<h1 data-testid="documents-heading">Upload your documents</h1>
<div data-testid="resume-upload">
<label for="resume-${seq}">Résumé / CV</label>
<input type="file" id="resume-${seq}" name="resume" accept=".pdf,.doc,.docx" data-testid="resume-file-input">
</div>
<div data-testid="cover-letter-upload">
<label for="cover-${seq}">Cover letter (optional)</label>
<input type="file" id="cover-${seq}" name="cover-letter" accept=".pdf,.doc,.docx" data-testid="cover-letter-file-input">
</div>
${iaField('Portfolio or GitHub URL', seq, 'url')}
${iaField('LinkedIn profile URL', seq, 'url')}
${iaSelect('How did you hear about this job?', seq, ['Glassdoor', 'Indeed', 'Referral', 'Company website', 'Other'])}
${iaContinue('Continue to review')}`),
    };
}

function buildIndeedApplyReview(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'glassdoor-indeed-apply-review',
        title: `Apply - ${role} - Review`,
        pageUrl: `${INDEED_APPLY_BASE}/form/review?jl=${seq}`,
        html: indeedApplyShell(`Review - ${role}`, `
<h1 data-testid="review-heading">Review your application</h1>
<p data-testid="review-summary">You are applying for <strong>${role}</strong> at <strong>${company}</strong> via Glassdoor Easy Apply.</p>
${iaField('Confirm email address', seq, 'email', 'required')}
${iaField('Confirm phone number', seq, 'tel', 'required')}
${iaTextarea('Final comments for the recruiter (optional)', seq, 3)}
${iaSelect('Preferred contact method', seq, ['Email', 'Phone', 'Either'])}
${iaRadioGroup('I certify that the information provided is accurate', seq, ['I agree'])}
${iaSubmit()}`),
    };
}

function buildEasyApplyHost(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const jobId = 101_002_850_000 + seq;
    const iframeBody = indeedApplyShell('Contact info', `
${iaField('First name', seq, 'text', 'required')}
${iaField('Last name', seq, 'text', 'required')}
${iaField('Email', seq, 'email', 'required')}
${iaLocationFields(seq)}
${iaContinue()}`).replace('<!DOCTYPE html>', '').replace(/<\/?html[^>]*>/g, '').replace(/<\/?head>[\s\S]*?<\/head>/, '').replace(/<\/?body[^>]*>/g, '');

    return {
        category: 'glassdoor-easy-apply-host',
        title: `${role} at ${company} - Easy Apply`,
        pageUrl: `${GLASSDOOR_BASE}/job-listing/job.htm?jl=${jobId}`,
        html: glassdoorShell(`${role} - Easy Apply open`, `
<article data-test="job-details"><h1>${role}</h1><p data-test="employer-name">${company}</p></article>
<button type="button" data-test="applyButton" aria-label="Easy Apply">Easy Apply</button>
<iframe title="Job application form" src="${INDEED_APPLY_BASE}/form/contact?jl=${jobId}">${iframeBody}</iframe>`),
    };
}

function buildOverlaySearch(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);

    return {
        category: 'glassdoor-overlay-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${GLASSDOOR_BASE}/Job/jobs.htm?sc.keyword0=${encodeURIComponent(role)}`,
        html: glassdoorShell(`${role} jobs`, `
<div id="onetrust-banner-sdk" data-test="cookie-banner">
<button type="button" id="onetrust-accept-btn-handler" data-test="accept-cookie-policy">Accept All Cookies</button>
</div>
<div id="HardsellOverlay" class="LoginModal" data-test="authModal" style="display:none"></div>
<section data-test="job-search-results">
${gdSearchInputs(seq, role, city)}
<ul data-test="job-results">${gdJobCard(seq, 0, role, pick(rng, COMPANIES), city, true)}</ul>
</section>`),
    };
}

/** @type {Array<(index: number, seq: number, rng: () => number) => object>} */
const BUILDERS = [
    buildJobSearch,
    buildJobListing,
    buildJobDetail,
    buildJobDetailExternal,
    buildIndeedApplyContact,
    buildIndeedApplyQuestions,
    buildIndeedApplyScreening,
    buildIndeedApplyDocuments,
    buildIndeedApplyReview,
    buildEasyApplyHost,
    buildOverlaySearch,
];

const beforeCount = manifest.scenarios.length;
let generated = 0;

for (let i = 1; i <= TOTAL; i += 1) {
    const id = `syn-gd-300-${String(i).padStart(3, '0')}`;
    const builder = BUILDERS[(i - 1) % BUILDERS.length];
    const rng = createRng(i * 4177 + 91);
    const result = builder(i, 300_000 + i, rng);

    addScenario(id, result.category, result.title, result.html, result.pageUrl, {
        notes: `${result.category} Glassdoor synthetic fixture`,
        requiresInteraction: result.requiresInteraction ?? false,
        interactionSteps: result.interactionSteps ?? [],
    });
    generated += 1;
}

saveManifest(manifest);

console.log(`Generated ${generated} Glassdoor form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${beforeCount} -> ${manifest.scenarios.length} scenarios (${MANIFEST_PATH})`);
