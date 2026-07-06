#!/usr/bin/env node
/**
 * Generate 500 complex synthetic form fixtures (syn-complex-500-001 .. syn-complex-500-500).
 * Multi-section ATS-like forms with varied field types and conditional follow-ups.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const TOTAL = 500;

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

const NAMES = ['Full name', 'Legal name', 'Applicant name', 'Your name', 'Preferred name'];
const EMAILS = ['Email address', 'Work email', 'Contact email', 'Personal email'];
const PHONES = ['Phone number', 'Mobile number', 'Contact number', 'Telephone'];
const COVERS = ['Cover letter', 'Why this role?', 'Tell us about yourself', 'Motivation statement', 'Personal statement'];
const LOCATIONS = ['Preferred location', 'Work location', 'Office preference', 'Current city'];
const SKILLS = ['Key skills', 'Technical skills', 'Primary expertise', 'Core competencies'];
const START_DATES = ['Earliest start date', 'Available from', 'Start date preference', 'When can you start?'];
const REFERRALS = ['How did you hear about us?', 'Referral source', 'Application source'];
const VISAS = ['Do you require visa sponsorship?', 'Visa sponsorship needed?', 'Work authorization status'];
const RELOCATES = ['Open to relocation?', 'Willing to relocate?', 'Relocation preference'];
const SALARIES = ['Expected salary', 'Salary expectations', 'Compensation requirement', 'Desired base salary'];
const PORTFOLIOS = ['Portfolio URL', 'Personal website', 'GitHub profile', 'Work samples link'];
const LOC_OPTS = ['London', 'Remote', 'Hybrid', 'Manchester', 'Berlin', 'Dublin', 'New York'];
const SKILL_OPTS = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'SQL', 'React', 'Laravel'];
const REF_OPTS = ['LinkedIn', 'Referral', 'Job board', 'Company site', 'Conference', 'Other'];

function shell(title, body, headExtra = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title>${headExtra}</head>
<body>
${body}
</body>
</html>`;
}

function formWrap(title, inner, attrs = 'action="/apply" method="post"') {
    return shell(title, `<main><h1>${title}</h1><form ${attrs}>${inner}</form></main>`);
}

function contactBlock(seq, rng, prefix = 'cx') {
    const nameLabel = `${pick(rng, NAMES)} (${seq})`;
    const emailLabel = `${pick(rng, EMAILS)} (${seq})`;
    const phoneLabel = `${pick(rng, PHONES)} (${seq})`;
    const nameId = `${prefix}-name-${seq}`;
    const emailId = `${prefix}-email-${seq}`;
    const phoneId = `${prefix}-phone-${seq}`;

    return {
        html: `
<label for="${nameId}">${nameLabel}</label>
<input type="text" id="${nameId}" name="${nameId}" autocomplete="name">
<label for="${emailId}">${emailLabel}</label>
<input type="email" id="${emailId}" name="${emailId}" autocomplete="email">
<label for="${phoneId}">${phoneLabel}</label>
<input type="tel" id="${phoneId}" name="${phoneId}" autocomplete="tel">`,
        labels: { name: nameLabel, email: emailLabel, phone: phoneLabel },
    };
}

function labeledInput(label, seq, type = 'text', extra = '') {
    const id = slugify(`${label}-${seq}`).slice(0, 28);

    return `<div class="field-row"><label for="${id}">${label}</label><input type="${type}" id="${id}" name="${id}" ${extra}></div>`;
}

function labeledTextarea(label, seq, maxLength = null) {
    const id = slugify(`${label}-${seq}`).slice(0, 28);
    const max = maxLength ? ` maxlength="${maxLength}"` : '';

    return `<div class="field-row"><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="4"${max}></textarea></div>`;
}

function labeledSelect(label, seq, options) {
    const id = slugify(`${label}-${seq}`).slice(0, 28);
    const opts = options.map((o) => `<option value="${slugify(o)}">${o}</option>`).join('');

    return `<div class="field-row"><label for="${id}">${label}</label><select id="${id}" name="${id}"><option value="">Choose one…</option>${opts}</select></div>`;
}

function fieldsetRadio(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 24);

    return `<fieldset><legend>${label}</legend>${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${slugify(opt)}"> ${opt}</label>`;
    }).join('')}</fieldset>`;
}

function fieldsetCheckbox(label, seq, options) {
    const name = slugify(`${label}-${seq}`).slice(0, 24);

    return `<fieldset><legend>${label}</legend>${options.map((opt, i) => {
        const id = `${name}-cb-${i}`;

        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}[]" value="${slugify(opt)}"> ${opt}</label>`;
    }).join('')}</fieldset>`;
}

function fileUpload(seq, label = 'Attach resume') {
    return `<div class="file-row"><label for="file-${seq}">${label} (${seq})</label><input type="file" id="file-${seq}" name="file-${seq}" accept=".pdf,.doc,.docx"></div>`;
}

function salaryField(label, seq) {
    return labeledInput(label, seq, 'number', 'min="0" step="1000" placeholder="Annual amount"');
}

function dateField(label, seq) {
    return labeledInput(label, seq, 'date');
}

function continueBtn(text = 'Continue') {
    return `<button type="button">${text}</button>`;
}

function hiddenRevealPanel(seq, fieldsHtml, buttonText = 'Show additional questions') {
    const panelId = `reveal-${seq}`;

    return `
<button type="button" id="reveal-btn-${seq}" data-reveal="#${panelId}">${buttonText}</button>
<div id="${panelId}" hidden style="display:none">${fieldsHtml}</div>`;
}

function commonScreeningBlock(seq, rng) {
    return [
        labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500),
        labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 5)),
        fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No']),
        fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No', 'Maybe later']),
        salaryField(`${pick(rng, SALARIES)} (${seq})`, seq),
        dateField(`${pick(rng, START_DATES)} (${seq})`, seq),
        labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, pickN(rng, REF_OPTS, 4)),
        fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 4)),
        fileUpload(seq),
    ].join('\n');
}

function addScenario(id, category, title, html, options = {}) {
    const filename = `${id}.html`;
    writeFileSync(join(HTML_DIR, filename), html);
    upsertScenario(manifest, {
        id,
        category,
        source: 'synthetic',
        status: 'pending',
        html_file: filename,
        page_url: `https://example.test/corpus/${id}`,
        page_title: title,
        notes: options.notes || `${category} complex corpus fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildGreenhouse(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'gh');

    return {
        category: 'complex-greenhouse',
        title: `Greenhouse complex apply ${seq}`,
        html: formWrap(`Greenhouse complex apply ${seq}`, `
<div id="application" class="application--container">
<section class="section" aria-label="Personal information">
<h2>Personal information</h2>
${contact.html.replace(/<label for="([^"]+)">([^<]+)<\/label>\s*<input/g, '<div class="field"><label id="$1-label" for="$1">$2</label><input aria-labelledby="$1-label"')}
</section>
<section class="section" aria-label="Application questions">
<h2>Application questions</h2>
${commonScreeningBlock(seq, rng)}
${labeledInput(`${pick(rng, PORTFOLIOS)} (${seq})`, seq, 'url')}
</section>
<section class="section" aria-label="EEO">
<h2>Additional details</h2>
${fieldsetRadio('Are you authorized to work in this country?', seq, ['Yes', 'No'])}
${continueBtn('Submit application')}
</section>
</div>`),
    };
}

function buildLever(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'lv');
    const c = contact.labels;

    return {
        category: 'complex-lever',
        title: `Lever complex apply ${seq}`,
        html: formWrap(`Lever complex apply ${seq}`, `
<div class="application-form lever-form">
<section class="application-section" data-section="contact">
<h2 class="application-heading">Contact</h2>
<div class="application-field"><label class="application-label">${c.name}</label><input name="lv-name-${seq}" type="text" id="lv-name-${seq}"></div>
<div class="application-field"><label class="application-label">${c.email}</label><input name="lv-email-${seq}" type="email" id="lv-email-${seq}"></div>
<div class="application-field"><label class="application-label">${c.phone}</label><input name="lv-phone-${seq}" type="tel" id="lv-phone-${seq}"></div>
</section>
<section class="application-section" data-section="questions">
<h2 class="application-heading">Questions</h2>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
${salaryField(`${pick(rng, SALARIES)} (${seq})`, seq)}
${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}
${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 4))}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, pickN(rng, REF_OPTS, 4))}
</section>
<section class="application-section" data-section="documents">
<h2 class="application-heading">Documents</h2>
${fileUpload(seq, 'Resume/CV')}
<div class="file-row"><label for="file-cover-${seq}">Cover letter file (${seq})</label><input type="file" id="file-cover-${seq}" name="file-cover-${seq}" accept=".pdf,.doc,.docx"></div>
</section>
<button type="button">Submit application</button>
</div>`),
    };
}

function buildAshby(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'ash');

    return {
        category: 'complex-ashby',
        title: `Ashby complex apply ${seq}`,
        html: shell(`Ashby complex apply ${seq}`, `
<main class="_container_ud4nd_29"><h1 class="_title_ud4nd_47">Apply - Role ${seq}</h1>
<form class="_applicationForm_ud4nd_61" action="/apply" method="post">
<section class="_section_ud4nd_71" data-section="contact">
<h2 class="_sectionTitle_ud4nd_77">Contact details</h2>
${contact.html.replace(/<label/g, '<div class="_fieldEntry_ud4nd_85"><label class="_label_ud4nd_91"').replace(/<input/g, '</div><input class="_input_ud4nd_97"')}
</section>
<section class="_section_ud4nd_71" data-section="screening">
<h2 class="_sectionTitle_ud4nd_77">Screening questions</h2>
<div class="_questionField_ud4nd_103">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 600)}</div>
<div class="_questionField_ud4nd_103">${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}</div>
<div class="_questionField_ud4nd_103">${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, pickN(rng, REF_OPTS, 4))}</div>
<div class="_questionField_ud4nd_103">${salaryField(`${pick(rng, SALARIES)} (${seq})`, seq)}</div>
<div class="_questionField_ud4nd_103">${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}</div>
<div class="_questionField_ud4nd_103">${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 5))}</div>
<div class="_questionField_ud4nd_103">${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}</div>
</section>
<section class="_section_ud4nd_71" data-section="uploads">
<h2 class="_sectionTitle_ud4nd_77">Uploads</h2>
${fileUpload(seq)}
</section>
<button type="button" class="_submitButton_ud4nd_115">Submit application</button>
</form></main>`),
    };
}

function buildSmartRecruiters(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'sr');

    return {
        category: 'complex-smartrecruiters',
        title: `SmartRecruiters complex apply ${seq}`,
        html: shell(`SmartRecruiters complex apply ${seq}`, `
<main data-sr-application="true"><h1>Apply ${seq}</h1>
<form class="sr-form" action="/apply" method="post">
<section class="sr-section" data-section="contact">
<h2>Contact information</h2>
${contact.html}
</section>
<section class="sr-section" data-section="experience">
<h2>Experience and motivation</h2>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${labeledInput(`${pick(rng, PORTFOLIOS)} (${seq})`, seq, 'url')}
</section>
<section class="sr-section" data-section="preferences">
<h2>Preferences</h2>
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 5))}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
${salaryField(`${pick(rng, SALARIES)} (${seq})`, seq)}
${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}
${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 4))}
</section>
<section class="sr-section" data-section="documents">
<h2>Documents</h2>
${fileUpload(seq)}
</section>
${continueBtn('Continue application')}
</form></main>`),
    };
}

function buildWorkday(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'wd');
    const ref = (label) => `input-q_${slugify(label).slice(0, 14)}`;
    const row = (label, type = 'text') => {
        const r = ref(label);

        return `<div data-testid="${r}" class="ia-Questions-item"><div data-testid="${r}-label"><span data-testid="safe-markup">${label}</span></div><input data-testid="${r}-input" type="${type}" name="${r}-${seq}"></div>`;
    };

    return {
        category: 'complex-workday',
        title: `Workday complex apply ${seq}`,
        html: formWrap(`Workday complex apply ${seq}`, `
<div data-automation-id="applyFlowPrimaryPage">
<section data-automation-id="contactSection">
<h2>Contact information</h2>
${row(contact.labels.name)}
${row(contact.labels.email, 'email')}
${row(contact.labels.phone, 'tel')}
</section>
<section data-automation-id="questionSection">
<h2>Questions</h2>
<div data-testid="${ref(pick(rng, COVERS))}" class="ia-Questions-item"><div data-testid="${ref(pick(rng, COVERS))}-label"><span data-testid="safe-markup">${pick(rng, COVERS)} (${seq})</span></div><textarea data-testid="${ref(pick(rng, COVERS))}-input" name="wd-cover-${seq}" rows="4" maxlength="600"></textarea></div>
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4)).replace(/class="field-row"/g, 'class="ia-Questions-item"')}
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}
${salaryField(`${pick(rng, SALARIES)} (${seq})`, seq)}
${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}
${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 4))}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, pickN(rng, REF_OPTS, 4))}
${fileUpload(seq)}
</section>
${continueBtn('Save and continue')}
</div>`),
    };
}

function buildWizard(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'wiz');

    return {
        category: 'complex-wizard',
        title: `Wizard complex apply ${seq}`,
        html: formWrap(`Wizard complex apply ${seq}`, `
<div class="wizard" data-step="1">
<nav aria-label="Application progress"><ol><li aria-current="step">Contact</li><li>Screening</li><li>Documents</li></ol></nav>
<section class="wizard-panel" role="group" aria-labelledby="wizard-contact-${seq}">
<h2 id="wizard-contact-${seq}">Contact information</h2>
${contact.html}
</section>
<section class="wizard-panel" role="group" aria-labelledby="wizard-screen-${seq}">
<h2 id="wizard-screen-${seq}">Screening questions</h2>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 450)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
${salaryField(`${pick(rng, SALARIES)} (${seq})`, seq)}
${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}
</section>
<section class="wizard-panel" role="group" aria-labelledby="wizard-docs-${seq}">
<h2 id="wizard-docs-${seq}">Documents and skills</h2>
${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 5))}
${fileUpload(seq)}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, pickN(rng, REF_OPTS, 4))}
</section>
${continueBtn('Continue to review')}
</div>`),
    };
}

function buildConditional(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'cond');
    const followUp = [
        labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400),
        labeledInput(`${pick(rng, PORTFOLIOS)} (${seq})`, seq, 'url'),
        salaryField(`${pick(rng, SALARIES)} (${seq})`, seq),
    ].join('\n');

    return {
        category: 'complex-conditional',
        title: `Conditional complex apply ${seq}`,
        html: formWrap(`Conditional complex apply ${seq}`, `
<section role="group" aria-labelledby="step1-label-${seq}">
<p id="step1-label-${seq}">Step 1 - Contact</p>
${contact.html}
</section>
<section role="group" aria-labelledby="step2-label-${seq}">
<p id="step2-label-${seq}">Step 2 - Preferences</p>
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No', 'Maybe later'])}
${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}
${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 4))}
</section>
<section role="group" aria-labelledby="step3-label-${seq}">
<p id="step3-label-${seq}">Step 3 - Optional follow-up</p>
${hiddenRevealPanel(seq, followUp, 'Show follow-up questions')}
${fileUpload(seq)}
</section>
`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'show follow-up' }],
    };
}

function buildMixed(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'mix');

    return {
        category: 'complex-mixed',
        title: `Mixed complex apply ${seq}`,
        html: formWrap(`Mixed complex apply ${seq}`, `
<section class="mixed-contact">${contact.html}</section>
<section class="mixed-screening">
${commonScreeningBlock(seq, rng)}
${labeledInput(`${pick(rng, PORTFOLIOS)} (${seq})`, seq, 'url')}
${fieldsetRadio('Do you have a security clearance?', seq, ['Yes', 'No', 'In progress'])}
</section>
<section class="mixed-consent">
${fieldsetCheckbox('Which communication channels work for you?', seq, ['Email', 'Phone', 'SMS'])}
</section>
`),
    };
}

function buildLongForm(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'long');

    return {
        category: 'complex-long',
        title: `Long complex apply ${seq}`,
        html: formWrap(`Long complex apply ${seq}`, `
<section data-section="personal">
<h2>Personal details</h2>
${contact.html}
${labeledInput('LinkedIn profile URL', seq, 'url')}
${labeledInput('Current employer', seq)}
${labeledInput('Current job title', seq)}
</section>
<section data-section="motivation">
<h2>Motivation</h2>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 800)}
${labeledTextarea('Describe a challenging project you led', seq, 600)}
${labeledTextarea('Why are you leaving your current role?', seq, 400)}
</section>
<section data-section="logistics">
<h2>Logistics</h2>
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 5))}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}
${salaryField(`${pick(rng, SALARIES)} (${seq})`, seq)}
${dateField(`${pick(rng, START_DATES)} (${seq})`, seq)}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, pickN(rng, REF_OPTS, 5))}
</section>
<section data-section="skills">
<h2>Skills and documents</h2>
${fieldsetCheckbox(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 6))}
${fileUpload(seq)}
</section>
`),
    };
}

/** @type {Array<(index: number, seq: number, rng: () => number) => { category: string, title: string, html: string, requiresInteraction?: boolean, interactionSteps?: Array<{ action: string, selector?: string, text?: string }> }>} */
const BUILDERS = [
    buildGreenhouse,
    buildLever,
    buildAshby,
    buildSmartRecruiters,
    buildWorkday,
    buildWizard,
    buildConditional,
    buildMixed,
    buildLongForm,
    buildMixed,
];

const beforeCount = manifest.scenarios.length;
let generated = 0;

for (let i = 1; i <= TOTAL; i += 1) {
    const id = `syn-complex-500-${String(i).padStart(3, '0')}`;
    const builder = BUILDERS[(i - 1) % BUILDERS.length];
    const rng = createRng(i * 9001 + 500);
    const result = builder(i, i + 50_000, rng);

    addScenario(id, result.category, result.title, result.html, {
        notes: `${result.category} complex synthetic fixture (${BUILDERS.indexOf(builder) + 1}/${BUILDERS.length} template family)`,
        requiresInteraction: result.requiresInteraction ?? false,
        interactionSteps: result.interactionSteps ?? [],
    });
    generated += 1;
}

saveManifest(manifest);

console.log(`Generated ${generated} complex form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${beforeCount} -> ${manifest.scenarios.length} scenarios (${MANIFEST_PATH})`);
