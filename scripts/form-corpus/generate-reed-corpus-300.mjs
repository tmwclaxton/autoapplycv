#!/usr/bin/env node
/**
 * Generate 300 Reed Easy Apply synthetic form fixtures (syn-reed-300-001 .. syn-reed-300-300).
 * Mirrors search, job detail, and apply DOM from reed-auto-apply.js.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const TOTAL = 300;
const PAGE_BASE = 'https://www.reed.co.uk';

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
    'Bruin Financial',
    'Client Server',
    'RedTech Recruitment',
    'Reed Talent Solutions',
    'Palantir',
    'Salesforce',
    'Cisco',
    'SquareMile Consulting',
    'Informed Solutions',
    'Hays Recruitment',
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

function reedShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en-GB">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<div id="__next">
<nav class="navbar" data-qa="navBar"><a href="/">Reed.co.uk</a></nav>
<main>${body}</main>
<footer data-qa="pageFooter"><p>Reed synthetic corpus fixture</p></footer>
</div>
</body>
</html>`;
}

function reedField(label, seq, type = 'text', extra = '', qa = null) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const dataQa = qa || `field-${id}`;

    return `<div class="form-group" data-qa="${dataQa}">
<label for="${id}" data-qa="${dataQa}-label">${label}</label>
<input type="${type}" id="${id}" name="${id}" data-qa="${dataQa}-input" ${extra}>
</div>`;
}

function reedTextarea(label, seq, rows = 4, maxLength = null) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const dataQa = `field-${id}`;
    const max = maxLength ? ` maxlength="${maxLength}"` : '';

    return `<div class="form-group" data-qa="${dataQa}">
<label for="${id}" data-qa="${dataQa}-label">${label}</label>
<textarea id="${id}" name="${id}" rows="${rows}" data-qa="${dataQa}-input"${max}></textarea>
</div>`;
}

function reedSelect(label, seq, options) {
    const id = slugify(`${label}-${seq}`).slice(0, 32);
    const dataQa = `field-${id}`;
    const opts = options.map((o) => `<option value="${slugify(o)}">${o}</option>`).join('');

    return `<div class="form-group" data-qa="${dataQa}">
<label for="${id}" data-qa="${dataQa}-label">${label}</label>
<select id="${id}" name="${id}" data-qa="${dataQa}-input">
<option value="">Please select</option>${opts}
</select>
</div>`;
}

function reedRadioGroup(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 28);
    const dataQa = `fieldset-${name}`;

    return `<fieldset data-qa="${dataQa}">
<legend data-qa="application-step-subtitle">${label}</legend>
${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${slugify(opt)}" data-qa="radio-${id}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function reedCheckboxGroup(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 28);
    const dataQa = `fieldset-${name}`;

    return `<fieldset data-qa="${dataQa}">
<legend>${label}</legend>
${options.map((opt, i) => {
        const id = `${name}-cb-${i}`;

        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}[]" value="${slugify(opt)}" data-qa="checkbox-${id}"> ${opt}</label>`;
    }).join('')}
</fieldset>`;
}

function reedFile(label, seq, accept = '.pdf,.doc,.docx') {
    const id = `file-${seq}`;
    const dataQa = `field-${id}`;

    return `<div class="form-group" data-qa="${dataQa}">
<label for="${id}" data-qa="${dataQa}-label">${label}</label>
<input type="file" id="${id}" name="${id}" accept="${accept}" data-qa="${dataQa}-input">
</div>`;
}

function reedContinue(text = 'Continue') {
    return `<button type="button" data-qa="continue-button" class="btn btn-primary">${text}</button>`;
}

function reedSubmit(text = 'Submit application') {
    return `<button type="submit" data-qa="submit-button" class="btn btn-primary">${text}</button>`;
}

function reedApplyForm(stepTitle, inner, buttons = '') {
    return `<form data-qa="application-form" action="/jobs/apply/submit" method="post">
<h1 data-qa="application-step-title">${stepTitle}</h1>
${inner}
<div data-qa="application-actions">${buttons || `${reedContinue()} ${reedSubmit()}`}</div>
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
        notes: options.notes || `Reed ${category} synthetic fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildJobSearch(index, seq, rng) {
    const role = pick(rng, ROLES);
    const city = pick(rng, CITIES);
    const cards = pickN(rng, [...ROLES], 6).map((title, cardIndex) => {
        const company = pick(rng, COMPANIES);
        const jobId = 571_000_000 + seq * 10 + cardIndex;
        const slug = slugify(title);

        return `<article data-qa="job-card" data-id="job${jobId}">
<button type="button" data-qa="job-title-btn-wrapper">${title}</button>
<div data-qa="badges-container">
<span class="badge" data-qa="badge-0-easyApply">Easy Apply</span>
</div>
<h2><a href="/jobs/${slug}/${jobId}" data-qa="job-card-title" data-id="${jobId}">${title}</a></h2>
<div data-qa="job-posted-by">Posted today by <a href="/jobs/${slugify(company)}/p${1000 + cardIndex}">${company}</a></div>
<ul data-qa="job-metadata" role="list">
<li data-qa="job-metadata-salary" role="listitem">£45,000 - £65,000 per annum</li>
<li data-qa="job-metadata-location" role="listitem">${city}</li>
</ul>
</article>`;
    }).join('\n');

    return {
        category: 'reed-search',
        title: `${role} jobs in ${city}`,
        pageUrl: `${PAGE_BASE}/jobs/${slugify(role)}-jobs-in-${slugify(city)}?filterEasilyApply=true`,
        html: reedShell(`${role} jobs in ${city}`, `
<section data-qa="searchResultsList">
<form role="search" data-qa="jobSearchForm">
<label for="keywords-${seq}">What</label>
<input id="keywords-${seq}" name="keywords" type="search" value="${role}" data-qa="searchKeywords">
<label for="location-${seq}">Where</label>
<input id="location-${seq}" name="location" type="search" value="${city}" data-qa="searchLocation">
<button type="submit" data-qa="searchJobsBtn">Search jobs</button>
</form>
<div data-qa="jobResults">${cards}</div>
<a href="?pageno=2" data-qa="rel-page-next" rel="next">Next</a>
</section>`),
    };
}

function buildJobDetail(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);
    const city = pick(rng, CITIES);
    const jobId = 571_000_000 + seq;
    const slug = slugify(role);

    return {
        category: 'reed-job-detail',
        title: `${role} - Reed.co.uk`,
        pageUrl: `${PAGE_BASE}/jobs/${slug}/${jobId}`,
        html: reedShell(`${role} - Reed.co.uk`, `
<header data-qa="job-details-header">
<div data-qa="job-badges"><span data-qa="badge-0-easyApply">Easy Apply</span></div>
<h1 data-qa="job-title">${role}</h1>
<div data-qa="job-posted-by">Posted by <a href="/jobs/${slugify(company)}/p${seq}">${company}</a></div>
<ul data-qa="job-metadata" role="list">
<li data-qa="job-metadata-salary" role="listitem">£50,000 - £70,000 per annum</li>
<li data-qa="job-metadata-location" role="listitem">${city}</li>
</ul>
</header>
<div data-qa="job-description" class="job-description_jobDescription__26ney">
<h2>Job description</h2>
<p>We are hiring a ${role.toLowerCase()} to join our team at ${company}. You will build reliable software, collaborate across disciplines, and deliver customer value in ${city}.</p>
<p>Requirements include strong communication, problem solving, and experience with modern development practices.</p>
</div>
<div data-qa="job-action-section">
<button type="button" data-qa="apply-btn" class="btn btn-primary">Easy Apply</button>
</div>`),
    };
}

function buildApplicationPersonal(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'reed-application-personal',
        title: `Apply - ${role} - Your details`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, reedApplyForm('Your details', `
${reedField('First name', seq, 'text', 'required autocomplete="given-name"')}
${reedField('Last name', seq, 'text', 'required autocomplete="family-name"')}
${reedField('Email address', seq, 'email', 'required autocomplete="email"')}
${reedField('Phone number', seq, 'tel', 'required autocomplete="tel"')}
${reedField('Postcode', seq, 'text', 'autocomplete="postal-code"')}
${reedField('Town or city', seq, 'text', 'autocomplete="address-level2"')}
${reedSelect('Country of residence', seq, ['United Kingdom', 'Ireland', 'France', 'Germany', 'Other'])}
`, reedContinue('Save and continue'))),
    };
}

function buildApplicationScreening(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'reed-application-screening',
        title: `Apply - ${role} - Screening`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, reedApplyForm('Screening questions', `
${reedRadioGroup('Do you have the right to work in the United Kingdom?', seq, ['Yes', 'No'])}
${reedRadioGroup('Will you require visa sponsorship now or in the future?', seq, ['Yes', 'No', 'Not sure'])}
${reedSelect('Highest level of education', seq, DEGREE_OPTS)}
${reedSelect('Notice period', seq, NOTICE_OPTS)}
${reedField('Current salary (£)', seq, 'number', 'min="0" step="1000"')}
${reedField('Expected salary (£)', seq, 'number', 'min="0" step="1000"')}
${reedTextarea(`Why are you interested in this ${role.toLowerCase()} role?`, seq, 5, 800)}
${reedCheckboxGroup('Which skills do you have?', seq, pickN(rng, SKILL_OPTS, 5))}
`, reedContinue('Continue'))),
    };
}

function buildApplicationDocuments(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'reed-application-documents',
        title: `Apply - ${role} - Documents`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, reedApplyForm('Upload documents', `
${reedFile('CV / Resume', seq)}
${reedFile('Cover letter (optional)', seq)}
${reedField('Portfolio or GitHub URL', seq, 'url')}
${reedTextarea('Additional information', seq, 4, 500)}
${reedSelect('Years of relevant experience', seq, ['0-1', '1-3', '3-5', '5-10', '10+'])}
${reedRadioGroup('May we contact your current employer?', seq, ['Yes', 'No', 'Not applicable'])}
${reedRadioGroup('I confirm the information provided is accurate', seq, ['Yes'])}
`, reedContinue('Continue to review'))),
    };
}

function buildApplicationCoverLetter(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'reed-application-cover-letter',
        title: `Apply - ${role} - Cover letter`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, reedApplyForm('Cover letter', `
<p>You are applying for <strong>${role}</strong> at <strong>${company}</strong>.</p>
${reedTextarea('Cover letter', seq, 8, 2000)}
${reedTextarea('Why do you want to work at this company?', seq, 5, 1000)}
${reedSelect('How many years of experience do you have in this field?', seq, ['0-1', '1-3', '3-5', '5-10', '10+'])}
${reedField('LinkedIn profile URL', seq, 'url')}
${reedRadioGroup('Are you happy to undergo a background check?', seq, ['Yes', 'No'])}
`, reedContinue('Continue'))),
    };
}

function buildApplicationReview(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'reed-application-review',
        title: `Apply - ${role} - Review`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell('Review application', reedApplyForm('Check your application', `
<p data-qa="application-review-summary">You are applying for <strong>${role}</strong> at <strong>${company}</strong>.</p>
${reedField('Confirm email address', seq, 'email', 'required')}
${reedField('Confirm phone number', seq, 'tel', 'required')}
${reedTextarea('Final comments for the recruiter (optional)', seq, 3, 300)}
${reedSelect('Preferred contact method', seq, ['Email', 'Phone', 'Either'])}
${reedRadioGroup('I agree to the privacy policy and terms', seq, ['I agree'])}
`, reedSubmit('Send application'))),
    };
}

function buildConfirmationSuccess(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'reed-application-success',
        title: 'Application submitted - Reed.co.uk',
        pageUrl: `${PAGE_BASE}/jobs/application/success/${seq}`,
        html: reedShell('Application submitted', `
<section data-qa="application-confirmation">
<h1>Thank you for applying</h1>
<p>Your application for the ${role} position has been submitted successfully. We received your application.</p>
<form data-qa="application-feedback-form">
${reedSelect('How easy was it to apply?', seq, ['Very easy', 'Easy', 'Neutral', 'Difficult', 'Very difficult'])}
${reedTextarea('Any feedback on the application process?', seq, 3, 400)}
${reedRadioGroup('Would you recommend Reed to a friend?', seq, ['Yes', 'No', 'Maybe'])}
</form>
<a href="/jobs" data-qa="browse-more-jobs">Browse more jobs</a>
</section>`),
    };
}

function buildApplicationCombined(index, seq, rng) {
    const role = pick(rng, ROLES);
    const company = pick(rng, COMPANIES);

    return {
        category: 'reed-application-combined',
        title: `Apply - ${role} at ${company}`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, reedApplyForm(`Apply for ${role}`, `
<section data-qa="application-form-section">
<h2 data-qa="application-step-subtitle">Contact details</h2>
${reedField('Full name', seq, 'text', 'required')}
${reedField('Email address', seq, 'email', 'required')}
${reedField('Mobile number', seq, 'tel', 'required')}
${reedField('LinkedIn profile URL', seq, 'url')}
</section>
<section data-qa="application-form-section">
<h2 data-qa="application-step-subtitle">Role questions</h2>
${reedTextarea('Cover letter', seq, 6, 1200)}
${reedRadioGroup('Are you willing to work on-site in London?', seq, ['Yes', 'No', 'Hybrid only'])}
${reedSelect('Preferred work arrangement', seq, ['Remote', 'Hybrid', 'On-site'])}
${reedField('National Insurance number (optional)', seq, 'text')}
${reedSelect('How did you hear about this job?', seq, ['Reed.co.uk', 'LinkedIn', 'Referral', 'Company website', 'Other'])}
</section>
<section data-qa="application-form-section">
<h2 data-qa="application-step-subtitle">Documents</h2>
${reedFile('Upload CV', seq)}
${reedCheckboxGroup('Technologies you have used professionally', seq, pickN(rng, SKILL_OPTS, 6))}
</section>
`, `${reedContinue('Continue')} ${reedSubmit()}`)),
    };
}

function buildApplicationWizard(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'reed-application-wizard',
        title: `Apply - ${role} - Step 1 of 3`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, `
<nav aria-label="Application progress" data-qa="application-progress">
<ol><li aria-current="step">Personal</li><li>Experience</li><li>Submit</li></ol>
</nav>
${reedApplyForm('Personal information', `
${reedField('First name', seq, 'text', 'required')}
${reedField('Last name', seq, 'text', 'required')}
${reedField('Email', seq, 'email', 'required')}
${reedField('Phone', seq, 'tel', 'required')}
${reedSelect('Current employment status', seq, ['Employed', 'Self-employed', 'Unemployed', 'Student'])}
`, reedContinue('Next'))}`),
        requiresInteraction: false,
    };
}

function buildApplicationConditional(index, seq, rng) {
    const role = pick(rng, ROLES);

    return {
        category: 'reed-application-conditional',
        title: `Apply - ${role} - Eligibility`,
        pageUrl: `${PAGE_BASE}/jobs/apply/${seq}`,
        html: reedShell(`Apply - ${role}`, reedApplyForm('Eligibility and compliance', `
${reedRadioGroup('Do you hold a valid UK work permit?', seq, ['Yes', 'No'])}
${reedRadioGroup('Have you ever worked for this company before?', seq, ['Yes', 'No'])}
${reedRadioGroup('Are you subject to any non-compete agreements?', seq, ['Yes', 'No', 'Not applicable'])}
${reedTextarea('If you answered yes to non-compete, please explain', seq, 3, 400)}
${reedField('Security clearance level (if any)', seq, 'text')}
${reedSelect('Preferred start date month', seq, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}
${reedField('Earliest start date', seq, 'date')}
`, reedContinue('Save and continue'))),
    };
}

/** @type {Array<(index: number, seq: number, rng: () => number) => object>} */
const BUILDERS = [
    buildApplicationPersonal,
    buildApplicationScreening,
    buildApplicationDocuments,
    buildApplicationCoverLetter,
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
    const id = `syn-reed-300-${String(i).padStart(3, '0')}`;
    const builder = BUILDERS[(i - 1) % BUILDERS.length];
    const rng = createRng(i * 7919 + 42);
    const result = builder(i, 571_000_000 + i, rng);

    addScenario(id, result.category, result.title, result.html, result.pageUrl, {
        notes: `${result.category} Reed synthetic fixture`,
        requiresInteraction: result.requiresInteraction ?? false,
        interactionSteps: result.interactionSteps ?? [],
    });
    generated += 1;
}

saveManifest(manifest);

console.log(`Generated ${generated} Reed form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${beforeCount} -> ${manifest.scenarios.length} scenarios (${MANIFEST_PATH})`);
