#!/usr/bin/env node
/**
 * Generate 100 framework-style synthetic form fixtures (syn-fw-*).
 * Run standalone — does not regenerate existing syn-basic/syn-workday/etc.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();

const names = ['Full name', 'Legal name', 'Applicant name', 'Your name'];
const emails = ['Email address', 'Work email', 'Contact email', 'Personal email'];
const phones = ['Phone number', 'Mobile number', 'Contact number', 'Telephone'];
const covers = ['Cover letter', 'Why this role?', 'Tell us about yourself', 'Motivation statement'];
const locations = ['Current city', 'Preferred location', 'Where are you based?', 'Work location'];
const referrals = ['How did you hear about us?', 'Referral source', 'Application source'];
const visas = ['Do you require visa sponsorship?', 'Visa sponsorship needed?', 'Work authorization status'];
const relocates = ['Open to relocation?', 'Willing to relocate?', 'Relocation preference'];

function shell(title, body, headExtra = '', bodyWrap = null) {
    const inner = bodyWrap ? bodyWrap(body) : body;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title>${headExtra}</head>
<body>
${inner}
</body>
</html>`;
}

function formShell(title, body, attrs = 'action="/apply" method="post"') {
    return shell(title, `<main><h1>${title}</h1><form ${attrs}>${body}</form></main>`);
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

function pick(list, index) {
    return list[index % list.length];
}

function labeledInput(label, type = 'text', extra = '', wrapper = 'div') {
    const id = slugify(`${label}-${type}`).slice(0, 28);

    return `<${wrapper} class="field-row">
<label for="${id}">${label}</label>
<input type="${type}" id="${id}" name="${id}" ${extra}>
</${wrapper}>`;
}

function labeledTextarea(label, maxLength = null, extra = '') {
    const id = slugify(label).slice(0, 28);
    const max = maxLength ? ` maxlength="${maxLength}"` : '';

    return `<div class="field-row"><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="4"${max} ${extra}></textarea></div>`;
}

function labeledSelect(label, options, extra = '') {
    const id = slugify(label).slice(0, 28);
    const opts = options.map((o) => `<option value="${slugify(o)}">${o}</option>`).join('');

    return `<div class="field-row"><label for="${id}">${label}</label><select id="${id}" name="${id}" ${extra}><option value="">Choose one…</option>${opts}</select></div>`;
}

function fieldsetRadio(label, options) {
    const name = slugify(label).slice(0, 24);

    return `<fieldset><legend>${label}</legend>${options.map((opt, i) => {
        const id = `${name}-${i}`;

        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${slugify(opt)}"> ${opt}</label>`;
    }).join('')}</fieldset>`;
}

function ariaRadiogroup(label, options) {
    const gid = slugify(label).slice(0, 24);

    return `<div role="radiogroup" aria-labelledby="${gid}-lbl" id="${gid}">
<span id="${gid}-lbl">${label}</span>
${options.map((opt, i) => `<div role="radio" tabindex="${i === 0 ? 0 : -1}" aria-checked="false" data-value="${slugify(opt)}">${opt}</div>`).join('')}
</div>`;
}

function continueBtn(text = 'Continue') {
    return `<button type="button">${text}</button>`;
}

function fileUploadDecor(label = 'Attach resume (optional)') {
    return `<div class="file-row"><label for="file-upload">${label}</label><input type="file" id="file-upload" name="file-upload" accept=".pdf,.doc"></div>`;
}

/** Vue-like patterns */
function buildVuePage(index) {
    const scope = `data-v-${String(1000 + index).slice(1)}`;
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const cover = pick(covers, index);
    const variants = [
        () => formShell(`Vue apply ${index + 1}`, `
<div id="app" ${scope}>
<div class="application-form ${scope}">
<div class="form-group ${scope}"><label for="vue-name" ${scope}>${name}</label><input ${scope} type="text" id="vue-name" name="vue-name" v-model="form.name"></div>
<div class="form-group ${scope}"><label for="vue-email" ${scope}>${email}</label><input ${scope} type="email" id="vue-email" name="vue-email" v-model="form.email"></div>
<div class="form-group ${scope}"><label for="vue-phone" ${scope}>${phone}</label><input ${scope} type="tel" id="vue-phone" name="vue-phone" v-model="form.phone"></div>
${labeledTextarea(cover, 500, scope)}
${fileUploadDecor()}
${continueBtn('Save and continue')}
</div>
</div>`),
        () => formShell(`Vue portal apply ${index + 1}`, `
<div id="app" ${scope}>
<form ${scope} class="v-form">
<div class="input-wrapper ${scope}"><label for="p-name">${name}</label><input id="p-name" name="p-name" type="text" ${scope}></div>
<div class="input-wrapper ${scope}"><label for="p-email">${email}</label><input id="p-email" name="p-email" type="email" ${scope}></div>
<div class="input-wrapper ${scope}"><label for="p-phone">${phone}</label><input id="p-phone" name="p-phone" type="tel" ${scope}></div>
</form>
<div id="teleport-target">
<!-- Teleport-like portal markup -->
<div class="portal-actions ${scope}" role="group" aria-label="Application actions">
${continueBtn('Next step')}
</div>
</div>
${fieldsetRadio(pick(relocates, index), ['Yes', 'No', 'Maybe later'])}
</div>`),
        () => formShell(`Vue scoped grid ${index + 1}`, `
<div class="grid-form ${scope}" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
<div class="col-span-2 ${scope}"><label for="g-name">${name}</label><input id="g-name" name="g-name" type="text" ${scope}></div>
<div ${scope}><label for="g-email">${email}</label><input id="g-email" name="g-email" type="email" ${scope}></div>
<div ${scope}><label for="g-phone">${phone}</label><input id="g-phone" name="g-phone" type="tel" ${scope}></div>
<div class="col-span-2 ${scope}">${labeledSelect(pick(locations, index), ['London', 'Remote', 'Hybrid', 'Manchester'])}</div>
</div>`),
    ];

    return variants[index % variants.length]();
}

/** React-like patterns */
function buildReactPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const cover = pick(covers, index);
    const variants = [
        () => formShell(`React apply ${index + 1}`, `
<div id="root" data-reactroot="">
<div class="App">
<div class="component FormSection" role="group" aria-label="Contact details">
<div class="component Field"><label htmlFor="r-name">${name}</label><input id="r-name" name="r-name" type="text" aria-label="${name}"></div>
<div class="component Field"><label htmlFor="r-email">${email}</label><input id="r-email" name="r-email" type="email" aria-label="${email}"></div>
<div class="component Field"><label htmlFor="r-phone">${phone}</label><input id="r-phone" name="r-phone" type="tel" aria-label="${phone}"></div>
</div>
<div class="component Field">${labeledTextarea(cover, 400)}</div>
${continueBtn('Continue')}
</div>
</div>`),
        () => formShell(`React nested ${index + 1}`, `
<div data-reactroot><div><div class="jsx-form">
<div role="group" aria-labelledby="contact-heading"><h2 id="contact-heading">Contact information</h2>
<label for="jsx-name">${name}</label><input id="jsx-name" name="jsx-name" type="text">
<label for="jsx-email">${email}</label><input id="jsx-email" name="jsx-email" type="email">
<label for="jsx-phone">${phone}</label><input id="jsx-phone" name="jsx-phone" type="tel">
</div>
${ariaRadiogroup(pick(visas, index), ['Yes', 'No'])}
<button type="button" aria-label="Continue to next section">Continue</button>
</div></div></div>`),
        () => formShell(`React aria ${index + 1}`, `
<div data-reactroot class="application">
<input type="text" name="react-name" id="react-name" aria-label="${name}" placeholder="${name}">
<input type="email" name="react-email" id="react-email" aria-label="${email}" placeholder="${email}">
<input type="tel" name="react-phone" id="react-phone" aria-label="${phone}" placeholder="${phone}">
${labeledSelect(pick(referrals, index), ['LinkedIn', 'Referral', 'Job board', 'Other'])}
</div>`),
    ];

    return variants[index % variants.length]();
}

/** Svelte-like patterns */
function buildSveltePage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const hash = String(10000 + index * 17).slice(1, 6);

    return formShell(`Svelte apply ${index + 1}`, `
<div class="svelte-${hash} application">
<div class="field svelte-${hash}"><label class="svelte-${hash}" for="sv-name">${name}</label><input class="svelte-${hash}" id="sv-name" name="sv-name" type="text" bind:value={name}></div>
<div class="field svelte-${hash}"><label class="svelte-${hash}" for="sv-email">${email}</label><input class="svelte-${hash}" id="sv-email" name="sv-email" type="email" bind:value={email}></div>
<div class="field svelte-${hash}"><label class="svelte-${hash}" for="sv-phone">${phone}</label><input class="svelte-${hash}" id="sv-phone" name="sv-phone" type="tel" bind:value={phone}></div>
${labeledTextarea(pick(covers, index), 350, `class="svelte-${hash}"`)}
${index % 2 === 0 ? fieldsetRadio(pick(relocates, index), ['Yes', 'No']) : labeledSelect(pick(locations, index), ['London', 'Berlin', 'Remote'])}
</div>`);
}

/** Angular / Material patterns */
function buildAngularPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const variants = [
        () => shell(`Angular apply ${index + 1}`, `
<main ng-app="apply"><h1>Angular Application ${index + 1}</h1>
<form ngNoForm class="application-form" action="/apply" method="post" novalidate>
<mat-form-field appearance="outline">
<mat-label>${name}</mat-label>
<label for="ang-name">${name}</label>
<input matInput id="ang-name" name="ang-name" type="text" ng-model="candidate.name">
</mat-form-field>
<mat-form-field appearance="outline">
<mat-label>${email}</mat-label>
<label for="ang-email">${email}</label>
<input matInput id="ang-email" name="ang-email" type="email" ng-model="candidate.email">
</mat-form-field>
<mat-form-field appearance="outline">
<mat-label>${phone}</mat-label>
<label for="ang-phone">${phone}</label>
<input matInput id="ang-phone" name="ang-phone" type="tel" ng-model="candidate.phone">
</mat-form-field>
${labeledTextarea(pick(covers, index), 500)}
<button mat-button type="button">Continue</button>
</form></main>`),
        () => shell(`Angular CDK ${index + 1}`, `
<main><h1>Angular CDK ${index + 1}</h1>
<form action="/apply" method="post">
<div cdk-scrollable class="form-container">
<div class="mat-form-field"><label for="cdk-name">${name}</label><input id="cdk-name" name="cdk-name" type="text" ng-model="name"></div>
<div class="mat-form-field"><label for="cdk-email">${email}</label><input id="cdk-email" name="cdk-email" type="email"></div>
<div class="mat-form-field"><label for="cdk-phone">${phone}</label><input id="cdk-phone" name="cdk-phone" type="tel"></div>
<div cdkTrapFocus role="group" aria-label="Work preferences">${fieldsetRadio(pick(visas, index), ['Yes', 'No', 'Not applicable'])}</div>
</div>
</form></main>`),
        () => shell(`Angular material grid ${index + 1}`, `
<main ng-controller="ApplyCtrl"><h1>Material grid ${index + 1}</h1>
<form ng-submit="submit()" action="/apply" method="post">
<div class="mat-grid-list">
<div class="mat-grid-tile"><label for="grid-name">${name}</label><input id="grid-name" name="grid-name" type="text"></div>
<div class="mat-grid-tile"><label for="grid-email">${email}</label><input id="grid-email" name="grid-email" type="email"></div>
<div class="mat-grid-tile"><label for="grid-phone">${phone}</label><input id="grid-phone" name="grid-phone" type="tel"></div>
<div class="mat-grid-tile">${labeledSelect(pick(locations, index), ['Office', 'Remote', 'Hybrid'])}</div>
</div>
</form></main>`),
    ];

    return variants[index % variants.length]();
}

/** Web components — custom elements with nested form (light DOM; simulates WC hosting) */
function buildShadowPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);

    return shell(`Web component apply ${index + 1}`, `
<main>
<h1>Web component apply ${index + 1}</h1>
<apply-form-widget data-stage="${index + 1}">
<form slot="application" action="/apply" method="post">
<section class="wc-host">
<label for="wc-name-${index}">${name}</label>
<input id="wc-name-${index}" name="wc-name-${index}" type="text">
<label for="wc-email-${index}">${email}</label>
<input id="wc-email-${index}" name="wc-email-${index}" type="email">
<label for="wc-phone-${index}">${phone}</label>
<input id="wc-phone-${index}" name="wc-phone-${index}" type="tel">
${index % 2 === 0 ? labeledTextarea(pick(covers, index), 300) : fieldsetRadio(pick(relocates, index), ['Yes', 'No'])}
</section>
${continueBtn('Continue')}
</form>
</apply-form-widget>
<job-application-panel>
<div class="panel-inner" role="group" aria-label="Additional questions">
${index % 2 === 1 ? labeledSelect(pick(referrals, index), ['Website', 'LinkedIn', 'Friend', 'Other']) : ''}
</div>
</job-application-panel>
</main>`);
}

/** Complex DOM patterns */
function buildDomPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const sectionId = `section-${index}`;
    const variants = [
        () => formShell(`Nested fieldsets ${index + 1}`, `
<fieldset aria-labelledby="${sectionId}-legend">
<legend id="${sectionId}-legend">Personal details</legend>
<fieldset><legend>${name}</legend><input type="text" id="dom-name" name="dom-name" aria-label="${name}"></fieldset>
<label for="dom-email">${email}</label><input type="email" id="dom-email" name="dom-email">
<p id="dom-email-help" class="help-text">We will use this to contact you about your application.</p>
<label for="dom-phone">${phone}</label><input type="tel" id="dom-phone" name="dom-phone" aria-describedby="dom-email-help">
</fieldset>
${fieldsetRadio(pick(relocates, index), ['Yes', 'No'])}
${labeledTextarea(pick(covers, index), 450)}`),
        () => formShell(`Duplicate label patterns ${index + 1}`, `
<div class="grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
<div><label for="dup-name">${name}</label><span class="helper">Required</span><input id="dup-name" name="dup-name" type="text"></div>
<div><label for="dup-email">${email}</label><span class="helper">Required</span><input id="dup-email" name="dup-email" type="email"></div>
<div style="grid-column:span 2"><label for="dup-phone">${phone}</label><input id="dup-phone" name="dup-phone" type="tel"><small class="helper-text">Include country code</small></div>
</div>
${ariaRadiogroup(pick(visas, index), ['Yes', 'No', 'Unsure'])}`),
        () => formShell(`Conditional sections ${index + 1}`, `
<div role="group" aria-labelledby="step1-label"><p id="step1-label">Step 1 — Contact</p>
<label for="cond-name">${name}</label><input id="cond-name" name="cond-name" type="text">
<label for="cond-email">${email}</label><input id="cond-email" name="cond-email" type="email">
<label for="cond-phone">${phone}</label><input id="cond-phone" name="cond-phone" type="tel">
</div>
<div role="region" aria-label="Optional details" style="display:none"><p>Optional portfolio step locked until step 2.</p></div>
${labeledSelect(pick(locations, index), ['UK', 'EU', 'US', 'Other'])}`),
    ];

    return variants[index % variants.length]();
}

/** Multi-step wizard */
function buildWizardPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);

    return formShell(`Wizard apply ${index + 1}`, `
<div class="wizard" data-step="1">
<nav aria-label="Application progress"><ol><li aria-current="step">Contact</li><li>Experience</li><li>Review</li></ol></nav>
<div class="wizard-panel" role="group" aria-labelledby="wizard-step1">
<h2 id="wizard-step1">Contact information</h2>
<label for="wiz-name">${name}</label><input id="wiz-name" name="wiz-name" type="text">
<label for="wiz-email">${email}</label><input id="wiz-email" name="wiz-email" type="email">
<label for="wiz-phone">${phone}</label><input id="wiz-phone" name="wiz-phone" type="tel">
</div>
<div class="wizard-panel" aria-hidden="true" style="display:none"><p>Experience step (not yet visible)</p></div>
${labeledTextarea(pick(covers, index), 400)}
${continueBtn('Continue')}
${continueBtn('Next step')}
<button type="button">Save and continue</button>
</div>`);
}

/** Iframe srcdoc — main doc holds extractable fields; iframe adds nested DOM noise */
function buildIframePage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const srcdoc = `<!DOCTYPE html><html><body><form><label>Internal reference</label><input name="ref" type="text"><label>HR notes</label><textarea name="notes"></textarea></form></body></html>`;

    return shell(`Iframe apply ${index + 1}`, `
<main>
<h1>Iframe apply ${index + 1}</h1>
<form action="/apply" method="post">
<label for="main-name">${name}</label><input id="main-name" name="main-name" type="text">
<label for="main-email">${email}</label><input id="main-email" name="main-email" type="email">
<label for="main-phone">${phone}</label><input id="main-phone" name="main-phone" type="tel">
${labeledTextarea(pick(covers, index), 350)}
${continueBtn('Continue')}
</form>
<iframe title="Embedded application module" srcdoc="${srcdoc.replace(/"/g, '&quot;')}" width="400" height="200"></iframe>
</main>`);
}

/** Ashby-inspired (synthetic, not copied) */
function buildAshbyPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);

    return shell(`Ashby-style apply ${index + 1}`, `
<main class="_container_ud4nd_29">
<h1 class="_title_ud4nd_47">Apply — Role ${index + 1}</h1>
<form class="_applicationForm_ud4nd_61" action="/apply" method="post">
<div class="_fieldEntry_ud4nd_85">
<label class="_label_ud4nd_91" for="ashby-name">${name}</label>
<input class="_input_ud4nd_97" id="ashby-name" name="ashby-name" type="text" autocomplete="name">
</div>
<div class="_fieldEntry_ud4nd_85">
<label class="_label_ud4nd_91" for="ashby-email">${email}</label>
<input class="_input_ud4nd_97" id="ashby-email" name="ashby-email" type="email" autocomplete="email">
</div>
<div class="_fieldEntry_ud4nd_85">
<label class="_label_ud4nd_91" for="ashby-phone">${phone}</label>
<input class="_input_ud4nd_97" id="ashby-phone" name="ashby-phone" type="tel" autocomplete="tel">
</div>
<div class="_questionField_ud4nd_103">${labeledTextarea(pick(covers, index), 500)}</div>
<div class="_questionField_ud4nd_103">${fieldsetRadio(pick(visas, index), ['Yes', 'No'])}</div>
<button type="button" class="_submitButton_ud4nd_115">Submit application</button>
</form>
</main>`);
}

/** Workday-inspired */
function buildWorkdayPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const ref = (label) => `input-q_${slugify(label).slice(0, 14)}`;

    return formShell(`Workday-style apply ${index + 1}`, `
<div data-automation-id="applyFlowPrimaryPage">
<div data-testid="${ref(name)}" class="ia-Questions-item">
<div data-testid="${ref(name)}-label"><span data-testid="safe-markup">${name}</span></div>
<input data-testid="${ref(name)}-input" type="text" name="${ref(name)}">
</div>
<div data-testid="${ref(email)}" class="ia-Questions-item">
<div data-testid="${ref(email)}-label"><span data-testid="safe-markup">${email}</span></div>
<input data-testid="${ref(email)}-input" type="email" name="${ref(email)}">
</div>
<div data-testid="${ref(phone)}" class="ia-Questions-item">
<div data-testid="${ref(phone)}-label"><span data-testid="safe-markup">${phone}</span></div>
<input data-testid="${ref(phone)}-input" type="tel" name="${ref(phone)}">
</div>
<div data-testid="${ref(pick(covers, index))}" class="ia-Questions-item">
<div data-testid="${ref(pick(covers, index))}-label"><span data-testid="safe-markup">${pick(covers, index)}</span></div>
<textarea data-testid="${ref(pick(covers, index))}-input" name="${ref(pick(covers, index))}" rows="4" maxlength="600"></textarea>
</div>
${continueBtn('Save and continue')}
</div>`);
}

/** Lever-inspired */
function buildLeverPage(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);

    return formShell(`Lever-style apply ${index + 1}`, `
<div class="application-form">
<div class="application-field"><label class="application-label">${name}</label><input name="name" type="text"></div>
<div class="application-field"><label class="application-label">${email}</label><input name="email" type="email"></div>
<div class="application-field"><label class="application-label">${phone}</label><input name="phone" type="tel"></div>
<div class="application-field"><label class="application-label">${pick(covers, index)}</label><textarea name="cover" rows="4" maxlength="500"></textarea></div>
<div class="application-field"><label class="application-label">${pick(locations, index)}</label><input name="location" type="text"></div>
${fileUploadDecor('Resume attachment')}
<button type="button">Submit application</button>
</div>`);
}

const batches = [
    { prefix: 'syn-fw-vue', count: 12, category: 'framework-vue', build: buildVuePage },
    { prefix: 'syn-fw-react', count: 12, category: 'framework-react', build: buildReactPage },
    { prefix: 'syn-fw-svelte', count: 8, category: 'framework-svelte', build: buildSveltePage },
    { prefix: 'syn-fw-angular', count: 12, category: 'framework-angular', build: buildAngularPage },
    { prefix: 'syn-fw-shadow', count: 10, category: 'framework-web-component', build: buildShadowPage },
    { prefix: 'syn-fw-dom', count: 13, category: 'framework-complex-dom', build: buildDomPage },
    { prefix: 'syn-fw-wizard', count: 10, category: 'framework-wizard', build: buildWizardPage },
    { prefix: 'syn-fw-iframe', count: 5, category: 'framework-iframe', build: buildIframePage },
    { prefix: 'syn-fw-ashby', count: 8, category: 'framework-ashby', build: buildAshbyPage },
    { prefix: 'syn-fw-wd', count: 5, category: 'framework-workday', build: buildWorkdayPage },
    { prefix: 'syn-fw-lever', count: 5, category: 'framework-lever', build: buildLeverPage },
];

let generated = 0;

for (const batch of batches) {
    for (let i = 0; i < batch.count; i += 1) {
        const id = `${batch.prefix}-${String(i + 1).padStart(3, '0')}`;
        const html = batch.build(i);
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const title = titleMatch?.[1] ?? id;
        addScenario(id, batch.category, title, html, `${batch.category} synthetic fixture`);
        generated += 1;
    }
}

saveManifest(manifest);

console.log(`Generated ${generated} framework form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${MANIFEST_PATH} (${manifest.scenarios.length} total scenarios)`);
