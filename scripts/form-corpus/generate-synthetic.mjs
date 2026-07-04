#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();

function shell(title, body, extra = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<main>
<h1>${title}</h1>
<form action="/apply" method="post">
${body}
${extra}
</form>
</main>
</body>
</html>`;
}

function addScenario(id, category, title, html, notes = '') {
    const filename = `${id}.html`;
    writeFileSync(join(HTML_DIR, filename), html);
    upsertScenario(manifest, {
        id,
        category,
        source: 'synthetic',
        status: 'pending',
        html_file: filename,
        page_url: `https://example.test/forms/${id}`,
        page_title: title,
        notes,
    });
}

const firstNames = ['Alex', 'Jordan', 'Sam', 'Casey', 'Riley', 'Taylor', 'Morgan', 'Quinn'];
const fieldLabels = {
    name: ['Full name', 'Legal name', 'Your name', 'Applicant name', 'Name as on CV'],
    email: ['Email address', 'Email', 'Contact email', 'Work email', 'Personal email'],
    phone: ['Phone number', 'Mobile number', 'Telephone', 'Contact number', 'Phone'],
    linkedin: ['LinkedIn profile URL', 'LinkedIn URL', 'LinkedIn profile', 'LinkedIn link'],
    location: ['Current location', 'City', 'Where are you based?', 'Location', 'Current city'],
    salary: ['Expected salary', 'Salary expectations', 'Desired salary', 'Compensation expectations'],
    notice: ['Notice period', 'Availability to start', 'When can you start?', 'Earliest start date'],
    cover: ['Cover letter', 'Why do you want this role?', 'Tell us about yourself', 'Motivation statement'],
    visa: ['Do you require visa sponsorship?', 'Visa sponsorship required?', 'Will you need sponsorship?'],
    relocate: ['Are you willing to relocate?', 'Open to relocation?', 'Willing to relocate for this role?'],
    authorized: ['Are you legally authorized to work?', 'Work authorization', 'Eligible to work in this country?'],
    experience: ['Years of experience', 'Total years of professional experience', 'Years in this field'],
    portfolio: ['Portfolio URL', 'Website or portfolio', 'GitHub or portfolio link'],
    referral: ['How did you hear about us?', 'Referral source', 'Where did you find this job?'],
};

function inputRow(label, type = 'text', attrs = '') {
    const id = slugify(label).slice(0, 24) || 'field';

    return `<div class="form-group"><label for="${id}">${label}</label><input type="${type}" id="${id}" name="${id}" ${attrs}></div>`;
}

function textareaRow(label, maxLength = null) {
    const id = slugify(label).slice(0, 24) || 'textarea';
    const max = maxLength ? ` maxlength="${maxLength}"` : '';

    return `<div class="form-group"><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="4"${max}></textarea></div>`;
}

function selectRow(label, options) {
    const id = slugify(label).slice(0, 24) || 'select';
    const opts = options.map((option) => `<option value="${slugify(option)}">${option}</option>`).join('');

    return `<div class="form-group"><label for="${id}">${label}</label><select id="${id}" name="${id}"><option value="">Select…</option>${opts}</select></div>`;
}

function radioRow(label, options) {
    const group = slugify(label).slice(0, 24) || 'radio';

    return `<fieldset><legend>${label}</legend>${options.map((option, index) => {
        const id = `${group}-${index}`;

        return `<label><input type="radio" name="${group}" id="${id}" value="${slugify(option)}"> ${option}</label>`;
    }).join('')}</fieldset>`;
}

function checkboxRow(label, options) {
    const group = slugify(label).slice(0, 24) || 'checkbox';

    return `<fieldset><legend>${label}</legend>${options.map((option, index) => {
        const id = `${group}-${index}`;

        return `<label><input type="checkbox" name="${group}[]" id="${id}" value="${slugify(option)}"> ${option}</label>`;
    }).join('')}</fieldset>`;
}

function ariaRadioRow(label, options) {
    const groupId = slugify(label).slice(0, 24) || 'radiogroup';

    return `<div role="radiogroup" aria-labelledby="${groupId}-label" id="${groupId}">
<p id="${groupId}-label">${label}</p>
${options.map((option, index) => `<div role="radio" aria-checked="false" tabindex="${index === 0 ? 0 : -1}" data-value="${slugify(option)}">${option}</div>`).join('')}
</div>`;
}

function workdayRow(label, type = 'text', maxLength = null) {
    const ref = `input-q_${slugify(label).slice(0, 16)}`;
    const max = maxLength ? ` maxlength="${maxLength}"` : '';
    const labelBlock = `<div data-testid="${ref}-label"><span data-testid="safe-markup">${label}</span></div>`;

    if (type === 'textarea') {
        return `<div data-testid="${ref}" class="ia-Questions-item">
${labelBlock}
<textarea data-testid="${ref}-input" name="${ref}" rows="4"${max}></textarea>
</div>`;
    }

    return `<div data-testid="${ref}" class="ia-Questions-item">
${labelBlock}
<input data-testid="${ref}-input" type="${type}" name="${ref}"${max}>
</div>`;
}

function greenhouseRow(label, type = 'text') {
    const id = `question_${slugify(label).slice(0, 20)}`;

    return `<div class="field"><label id="${id}-label" for="${id}">${label}</label><input type="${type}" id="${id}" name="${id}" aria-labelledby="${id}-label"></div>`;
}

function continueButton(text = 'Continue') {
    return `<button type="button">${text}</button>`;
}

let counter = 0;

function nextId(prefix) {
    counter += 1;

    return `${prefix}-${String(counter).padStart(3, '0')}`;
}

for (let i = 0; i < fieldLabels.name.length; i += 1) {
    const id = nextId('syn-basic');
    const body = [
        inputRow(fieldLabels.name[i]),
        inputRow(fieldLabels.email[i], 'email'),
        inputRow(fieldLabels.phone[i], 'tel'),
        inputRow(fieldLabels.linkedin[i], 'url'),
    ].join('\n');
    addScenario(id, 'basic', `Application — ${fieldLabels.name[i]}`, shell(`Apply — ${fieldLabels.name[i]}`, body));
}

for (let i = 0; i < 12; i += 1) {
    const id = nextId('syn-workday');
    const body = [
        workdayRow(fieldLabels.name[i % fieldLabels.name.length]),
        workdayRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        workdayRow(fieldLabels.cover[i % fieldLabels.cover.length], 'textarea', 500),
        workdayRow(fieldLabels.experience[i % fieldLabels.experience.length], 'number'),
        continueButton('Save and continue'),
    ].join('\n');
    addScenario(id, 'workday', `Workday apply ${i + 1}`, shell(`Workday Application ${i + 1}`, body));
}

for (let i = 0; i < 12; i += 1) {
    const id = nextId('syn-greenhouse');
    const body = [
        greenhouseRow(fieldLabels.name[i % fieldLabels.name.length]),
        greenhouseRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        greenhouseRow(fieldLabels.phone[i % fieldLabels.phone.length], 'tel'),
        textareaRow(fieldLabels.cover[i % fieldLabels.cover.length], 1000),
    ].join('\n');
    addScenario(id, 'greenhouse', `Greenhouse apply ${i + 1}`, shell(`Greenhouse Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-visa');
    const body = [
        inputRow(fieldLabels.name[i % fieldLabels.name.length]),
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        radioRow(fieldLabels.visa[i % fieldLabels.visa.length], ['Yes', 'No', 'Not sure']),
        radioRow(fieldLabels.authorized[i % fieldLabels.authorized.length], ['Yes', 'No']),
    ].join('\n');
    addScenario(id, 'radio-yes-no', `Visa questions ${i + 1}`, shell(`Visa Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-select');
    const body = [
        inputRow(fieldLabels.name[i % fieldLabels.name.length]),
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        selectRow('Country of residence', ['United Kingdom', 'Ireland', 'United States', 'Germany', 'France']),
        selectRow(fieldLabels.referral[i % fieldLabels.referral.length], ['LinkedIn', 'Company website', 'Referral', 'Job board', 'Other']),
    ].join('\n');
    addScenario(id, 'select', `Select fields ${i + 1}`, shell(`Select Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-textarea');
    const max = 250 + (i * 50);
    const body = [
        inputRow(fieldLabels.name[i % fieldLabels.name.length]),
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        textareaRow(fieldLabels.cover[i % fieldLabels.cover.length], max),
        textareaRow('Describe a challenging project you led', 800),
    ].join('\n');
    addScenario(id, 'textarea', `Textarea ${i + 1}`, shell(`Textarea Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-checkbox');
    const body = [
        inputRow(fieldLabels.name[i % fieldLabels.name.length]),
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        checkboxRow('Which skills apply to you?', ['JavaScript', 'PHP', 'Python', 'SQL', 'AWS']),
        checkboxRow('Which languages do you speak?', ['English', 'French', 'Spanish', 'German']),
    ].join('\n');
    addScenario(id, 'checkbox', `Checkbox ${i + 1}`, shell(`Checkbox Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-aria-radio');
    const body = [
        inputRow(fieldLabels.name[i % fieldLabels.name.length]),
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        ariaRadioRow(fieldLabels.relocate[i % fieldLabels.relocate.length], ['Yes', 'No', 'Maybe later']),
        ariaRadioRow(fieldLabels.authorized[i % fieldLabels.authorized.length], ['Yes', 'No']),
    ].join('\n');
    addScenario(id, 'aria-radiogroup', `ARIA radio ${i + 1}`, shell(`ARIA Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-multistep');
    const body = [
        inputRow(fieldLabels.name[i % fieldLabels.name.length]),
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        inputRow(fieldLabels.phone[i % fieldLabels.phone.length], 'tel'),
        continueButton('Continue'),
        continueButton('Next step'),
    ].join('\n');
    addScenario(id, 'multistep', `Multi-step ${i + 1}`, shell(`Multi-step Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-mixed');
    const body = [
        workdayRow(fieldLabels.name[i % fieldLabels.name.length]),
        greenhouseRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        selectRow(fieldLabels.location[i % fieldLabels.location.length], ['London', 'Manchester', 'Remote', 'Hybrid']),
        radioRow(fieldLabels.visa[i % fieldLabels.visa.length], ['Yes', 'No']),
        textareaRow(fieldLabels.cover[i % fieldLabels.cover.length], 600),
        inputRow('Upload CV', 'file'),
        continueButton('Submit application'),
    ].join('\n');
    addScenario(id, 'mixed', `Mixed ATS ${i + 1}`, shell(`Mixed Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-prefilled');
    const name = firstNames[i % firstNames.length];
    const body = [
        `<div class="form-group"><label for="prefilled-name">Full name</label><input type="text" id="prefilled-name" name="prefilled-name" value="${name} Morgan"></div>`,
        inputRow(fieldLabels.email[i % fieldLabels.email.length], 'email'),
        inputRow(fieldLabels.phone[i % fieldLabels.phone.length], 'tel'),
        textareaRow(fieldLabels.cover[i % fieldLabels.cover.length], 400),
    ].join('\n');
    addScenario(id, 'prefilled-skip', `Prefilled skip ${i + 1}`, shell(`Prefilled Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-placeholder');
    const body = [
        `<input type="text" name="name" placeholder="Full name" aria-label="Full name">`,
        `<input type="email" name="email" placeholder="Email address" aria-label="Email address">`,
        `<input type="tel" name="phone" placeholder="Phone number" aria-label="Phone number">`,
        textareaRow(fieldLabels.salary[i % fieldLabels.salary.length]),
    ].join('\n');
    addScenario(id, 'placeholder', `Placeholder labels ${i + 1}`, shell(`Placeholder Application ${i + 1}`, body));
}

for (let i = 0; i < 10; i += 1) {
    const id = nextId('syn-lever');
    const body = [
        `<div class="application-field"><label>Full name</label><input type="text" name="name"></div>`,
        `<div class="application-field"><label>Email</label><input type="email" name="email"></div>`,
        `<div class="application-field"><label>Phone</label><input type="tel" name="phone"></div>`,
        `<div class="application-field"><label>${fieldLabels.portfolio[i % fieldLabels.portfolio.length]}</label><input type="url" name="portfolio"></div>`,
        `<div class="application-field"><label>${fieldLabels.notice[i % fieldLabels.notice.length]}</label><input type="text" name="notice"></div>`,
    ].join('\n');
    addScenario(id, 'lever', `Lever style ${i + 1}`, shell(`Lever Application ${i + 1}`, body));
}

saveManifest(manifest);

console.log(`Generated ${manifest.scenarios.length} synthetic scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${MANIFEST_PATH}`);
