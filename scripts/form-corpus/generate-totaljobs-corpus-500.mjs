#!/usr/bin/env node
/**
 * Generate 500 Totaljobs / StepStone Genesis synthetic form fixtures (syn-tj-500-001 .. syn-tj-500-500).
 * Mirrors harmonised apply, application steps, and UK screening patterns from totaljobs-auto-apply.js.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const TOTAL = 500;
const PAGE_BASE = 'https://www.totaljobs.com';

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
    'Stepstone UK',
    'Client Server',
    'RedTech Recruitment',
    'NSD',
    'Palantir',
    'Salesforce',
    'Cisco',
    'SquareMile Consulting',
    'Arondite LTD',
    'Informed Solutions',
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

function genesisShell(title, body, path = '/job/application') {
    return `<!DOCTYPE html>
<html lang="en-GB">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<div id="app-root" data-genesis-element="BASE">
<header data-testid="header-container" data-genesis-element="BASE">
<a data-testid="logo" href="/">Totaljobs</a>
</header>
<main data-genesis-element="BASE">${body}</main>
<footer data-genesis-element="PAGE_FOOTER"><p>Totaljobs synthetic corpus fixture</p></footer>
</div>
</body>
</html>`;
}

function tjField(label, seq, type = 'text', extra = '', testId = null) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const tid = testId || `field-${id}`;

    return `<div class="res-field" data-genesis-element="BASE" data-testid="${tid}">
<label for="${id}" data-testid="${tid}-label">${label}</label>
<input type="${type}" id="${id}" name="${id}" data-testid="${tid}-input" ${extra}>
</div>`;
}

function tjTextarea(label, seq, rows = 4, maxLength = null) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const max = maxLength ? ` maxlength="${maxLength}"` : '';

    return `<div class="res-field" data-genesis-element="BASE" data-testid="field-${id}">
<label for="${id}">${label}</label>
<textarea id="${id}" name="${id}" rows="${rows}" data-testid="field-${id}-input"${max}></textarea>
</div>`;
}

function tjSelect(label, seq, options) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const opts = options.map((o) => `<option value="${slugify(o)}">${o}</option>`).join('');

    return `<div class="res-field" data-genesis-element="BASE" data-testid="field-${id}">
<label for="${id}">${label}</label>
<select id="${id}" name="${id}" data-testid="field-${id}-input">
<option value="">Please select</option>${opts}
</select>
</div>`;
}

function tjRadioGroup(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 28);

    return `<fieldset data-testid="fieldset-${name}" data-genesis-element="BASE">
<legend data-testid="application-step-subtitle">${label}</legend>
${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${slugify(opt)}" data-testid="radio-${id}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function tjCheckboxGroup(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 28);

    return `<fieldset data-testid="fieldset-${name}">
<legend>${label}</legend>
${options.map((opt, i) => {
        const id = `${name}-cb-${i}`;

        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}[]" value="${slugify(opt)}" data-testid="checkbox-${id}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function tjFile(label, seq, accept = '.pdf,.doc,.docx') {
    const id = `file-${seq}`;

    return `<div class="res-field" data-testid="field-${id}">
<label for="${id}">${label}</label>
<input type="file" id="${id}" name="${id}" accept="${accept}" data-testid="field-${id}-input">
</div>`;
}

function tjContinue(text = 'Continue') {
    return `<button type="button" data-testid="continue-button" data-genesis-element="BUTTON">${text}</button>`;
}

function tjSubmit(text = 'Submit application') {
    return `<button type="submit" data-testid="submit-application-button" data-genesis-element="BUTTON">${text}</button>`;
}

function tjApplyForm(stepTitle, inner, buttons = '') {
    return `<form data-testid="application-form" data-at="application-form" data-genesis-element="FORM" action="/job/application" method="post">
<h1 data-testid="application-step-title" data-genesis-element="TEXT">${stepTitle}</h1>
${inner}
<div data-at="application-actions">${buttons || `${tjContinue()} ${tjSubmit()}`}</div>
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
        notes: options.notes || `Totaljobs ${category} synthetic fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildJobSearch(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const cards = pickN(rng, [...ROLES], 6).map((title, cardIndex) => {
        const company = pick(rng, COMPANIES);
        const jobId = 107_500_000 + seq * 10 + cardIndex;
        const slug = slugify(title);

        return `<article data-testid="job-item" data-at="job-item" data-genesis-element="CARD">
<a data-testid="job-item-title" data-at="job-item-title" href="/job/${slug}/${slugify(company)}-job${jobId}">${title}</a>
<span data-testid="job-item-company-name" data-at="job-item-company-name">${company}</span>
<p>${city} · Permanent · Posted today</p>
</article>`;
    }).join('\n');

    return {
        category: 'totaljobs-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${PAGE_BASE}/jobs/${slugify(role)}/in-${slugify(city)}`,
        html: genesisShell(`${role} jobs in ${city}`, `
<section data-testid="job-results-list" data-genesis-element="BASE">
<form role="search" data-testid="job-search-form">
<label for="keywords-${seq}">What</label>
<input id="keywords-${seq}" name="keywords" type="search" value="${role}" data-testid="search-keywords">
<label for="location-${seq}">Where</label>
<input id="location-${seq}" name="location" type="search" value="${city}" data-testid="search-location">
<button type="submit" data-testid="search-submit">Search jobs</button>
</form>
<div data-testid="job-results-list">${cards}</div>
</section>`),
    };
}

function buildJobDetail(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = 107_500_000 + seq;
    const slug = slugify(role);

    return {
        category: 'totaljobs-job-detail',
        title: `${role} at ${company}`,
        pageUrl: `${PAGE_BASE}/job/${slug}/${slugify(company)}-job${jobId}`,
        html: genesisShell(`${role} at ${company}`, `
<article data-at="job-ad-description" data-testid="job-description" data-genesis-element="CARD">
<h1>${role}</h1>
<p data-at="job-item-company-name">${company}</p>
<p>${city}</p>
<p>We are hiring a ${role.toLowerCase()} to join our team. You will build reliable software, collaborate across disciplines, and deliver customer value.</p>
</article>
<section data-at="apply-now-section" data-genesis-element="BASE">
<button type="button" data-testid="harmonised-apply-button" data-genesis-element="BUTTON">Apply</button>
</section>`),
    };
}

function buildApplicationPersonal(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'totaljobs-application-personal',
        title: `Apply - ${role} - Your details`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application/personal`,
        html: genesisShell(`Apply - ${role}`, tjApplyForm('Your details', `
${tjField('First name', seq, 'text', 'required autocomplete="given-name"')}
${tjField('Last name', seq, 'text', 'required autocomplete="family-name"')}
${tjField('Email address', seq, 'email', 'required autocomplete="email"')}
${tjField('Phone number', seq, 'tel', 'required autocomplete="tel"')}
${tjField('Postcode', seq, 'text', 'autocomplete="postal-code"')}
${tjField('Town or city', seq, 'text', 'autocomplete="address-level2"')}
${tjSelect('Country of residence', seq, ['United Kingdom', 'Ireland', 'France', 'Germany', 'Other'])}
`, tjContinue('Save and continue'))),
    };
}

function buildApplicationScreening(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'totaljobs-application-screening',
        title: `Apply - ${role} - Screening`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application/screening`,
        html: genesisShell(`Apply - ${role}`, tjApplyForm('Screening questions', `
${tjRadioGroup('Do you have the right to work in the United Kingdom?', seq, ['Yes', 'No'])}
${tjRadioGroup('Will you require visa sponsorship now or in the future?', seq, ['Yes', 'No', 'Not sure'])}
${tjSelect('Highest level of education', seq, DEGREE_OPTS)}
${tjSelect('Notice period', seq, NOTICE_OPTS)}
${tjField('Current salary (£)', seq, 'number', 'min="0" step="1000"')}
${tjField('Expected salary (£)', seq, 'number', 'min="0" step="1000"')}
${tjTextarea(`Why are you interested in this ${role.toLowerCase()} role?`, seq, 5, 800)}
${tjCheckboxGroup('Which skills do you have?', seq, pickN(rng, SKILL_OPTS, 5))}
`, tjContinue('Continue'))),
    };
}

function buildApplicationDocuments(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'totaljobs-application-documents',
        title: `Apply - ${role} - Documents`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application/documents`,
        html: genesisShell(`Apply - ${role}`, tjApplyForm('Upload documents', `
${tjFile('CV / Resume', seq)}
${tjFile('Cover letter (optional)', seq)}
${tjField('Portfolio or GitHub URL', seq, 'url')}
${tjTextarea('Additional information', seq, 4, 500)}
${tjSelect('Years of relevant experience', seq, ['0-1', '1-3', '3-5', '5-10', '10+'])}
${tjRadioGroup('May we contact your current employer?', seq, ['Yes', 'No', 'Not applicable'])}
${tjRadioGroup('I confirm the information provided is accurate', seq, ['Yes'])}
`, tjContinue('Continue to review'))),
    };
}

function buildApplicationReview(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'totaljobs-application-review',
        title: `Apply - ${role} - Review`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application/review`,
        html: genesisShell('Review application', tjApplyForm('Check your application', `
<p data-testid="application-review-summary">You are applying for <strong>${role}</strong> at <strong>${company}</strong>.</p>
${tjField('Confirm email address', seq, 'email', 'required')}
${tjField('Confirm phone number', seq, 'tel', 'required')}
${tjTextarea('Final comments for the recruiter (optional)', seq, 3, 300)}
${tjSelect('Preferred contact method', seq, ['Email', 'Phone', 'Either'])}
${tjRadioGroup('I agree to the privacy policy and terms', seq, ['I agree'])}
`, tjSubmit('Send application'))),
    };
}

function buildConfirmationSuccess(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'totaljobs-application-success',
        title: 'Did all go well with your application?',
        pageUrl: `${PAGE_BASE}/job/${seq}/application/confirmation/success?locale=en_GB`,
        html: genesisShell('Application submitted', `
<section data-testid="application-confirmation" data-genesis-element="BASE">
<h1>Did all go well with your application?</h1>
<p>Thank you for applying for the ${role} position. We received your application.</p>
<form data-testid="application-feedback-form">
${tjSelect('How easy was it to apply?', seq, ['Very easy', 'Easy', 'Neutral', 'Difficult', 'Very difficult'])}
${tjTextarea('Any feedback on the application process?', seq, 3, 400)}
${tjRadioGroup('Would you recommend Totaljobs to a friend?', seq, ['Yes', 'No', 'Maybe'])}
</form>
<a href="/jobs" data-testid="browse-more-jobs">Browse more jobs</a>
</section>`),
    };
}

function buildApplicationCombined(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'totaljobs-application-combined',
        title: `Apply - ${role} at ${company}`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application`,
        html: genesisShell(`Apply - ${role}`, tjApplyForm(`Apply for ${role}`, `
<section data-at="application-form-section">
<h2 data-testid="application-step-subtitle">Contact details</h2>
${tjField('Full name', seq, 'text', 'required')}
${tjField('Email address', seq, 'email', 'required')}
${tjField('Mobile number', seq, 'tel', 'required')}
${tjField('LinkedIn profile URL', seq, 'url')}
</section>
<section data-at="application-form-section">
<h2 data-testid="application-step-subtitle">Role questions</h2>
${tjTextarea('Cover letter', seq, 6, 1200)}
${tjRadioGroup('Are you willing to work on-site in London?', seq, ['Yes', 'No', 'Hybrid only'])}
${tjSelect('Preferred work arrangement', seq, ['Remote', 'Hybrid', 'On-site'])}
${tjField('National Insurance number (optional)', seq, 'text')}
${tjSelect('How did you hear about this job?', seq, ['Totaljobs', 'LinkedIn', 'Referral', 'Company website', 'Other'])}
</section>
<section data-at="application-form-section">
<h2 data-testid="application-step-subtitle">Documents</h2>
${tjFile('Upload CV', seq)}
${tjCheckboxGroup('Technologies you have used professionally', seq, pickN(rng, SKILL_OPTS, 6))}
</section>
`, `${tjContinue('Continue')} ${tjSubmit()}`)),
    };
}

function buildApplicationWizard(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'totaljobs-application-wizard',
        title: `Apply - ${role} - Step 1 of 3`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application/step-1`,
        html: genesisShell(`Apply - ${role}`, `
<nav aria-label="Application progress" data-testid="application-progress">
<ol><li aria-current="step">Personal</li><li>Experience</li><li>Submit</li></ol>
</nav>
${tjApplyForm('Personal information', `
${tjField('First name', seq, 'text', 'required')}
${tjField('Last name', seq, 'text', 'required')}
${tjField('Email', seq, 'email', 'required')}
${tjField('Phone', seq, 'tel', 'required')}
${tjSelect('Current employment status', seq, ['Employed', 'Self-employed', 'Unemployed', 'Student'])}
`, tjContinue('Next'))}`),
        requiresInteraction: false,
    };
}

function buildApplicationConditional(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'totaljobs-application-conditional',
        title: `Apply - ${role} - Eligibility`,
        pageUrl: `${PAGE_BASE}/job/${seq}/application/eligibility`,
        html: genesisShell(`Apply - ${role}`, tjApplyForm('Eligibility and compliance', `
${tjRadioGroup('Do you hold a valid UK work permit?', seq, ['Yes', 'No'])}
${tjRadioGroup('Have you ever worked for this company before?', seq, ['Yes', 'No'])}
${tjRadioGroup('Are you subject to any non-compete agreements?', seq, ['Yes', 'No', 'Not applicable'])}
${tjTextarea('If you answered yes to non-compete, please explain', seq, 3, 400)}
${tjField('Security clearance level (if any)', seq, 'text')}
${tjSelect('Preferred start date month', seq, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}
${tjField('Earliest start date', seq, 'date')}
`, tjContinue('Save and continue'))),
    };
}

/** @type {Array<(index: number, seq: number, rng: () => number) => object>} */
const BUILDERS = [
    buildApplicationPersonal,
    buildApplicationScreening,
    buildApplicationDocuments,
    buildApplicationReview,
    buildApplicationCombined,
    buildApplicationWizard,
    buildApplicationConditional,
    buildJobDetail,
    buildJobSearch,
    buildConfirmationSuccess,
];

const beforeCount = manifest.scenarios.length;
let generated = 0;

for (let i = 1; i <= TOTAL; i += 1) {
    const id = `syn-tj-500-${String(i).padStart(3, '0')}`;
    const builder = BUILDERS[(i - 1) % BUILDERS.length];
    const rng = createRng(i * 7919 + 42);
    const result = builder(i, 60_000 + i, rng);

    addScenario(id, result.category, result.title, result.html, result.pageUrl, {
        notes: `${result.category} Totaljobs synthetic fixture`,
        requiresInteraction: result.requiresInteraction ?? false,
        interactionSteps: result.interactionSteps ?? [],
    });
    generated += 1;
}

saveManifest(manifest);

console.log(`Generated ${generated} Totaljobs form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${beforeCount} -> ${manifest.scenarios.length} scenarios (${MANIFEST_PATH})`);
