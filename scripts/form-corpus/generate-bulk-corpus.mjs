#!/usr/bin/env node
/**
 * Generate 500 diverse synthetic corpus fixtures (syn-corpus2-*).
 * Covers additional ATS platforms, CSS frameworks, and layout patterns.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();

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
const COVERS = ['Cover letter', 'Why this role?', 'Tell us about yourself', 'Motivation statement'];
const LOCATIONS = ['Preferred location', 'Work location', 'Office preference', 'Current city'];
const REFERRALS = ['How did you hear about us?', 'Referral source', 'Application source'];
const VISAS = ['Do you require visa sponsorship?', 'Visa sponsorship needed?', 'Work authorization status'];
const RELOCATES = ['Open to relocation?', 'Willing to relocate?', 'Relocation preference'];
const LOC_OPTS = ['London', 'Remote', 'Hybrid', 'Manchester', 'Berlin', 'Dublin'];

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

function contactBlock(seq, rng, prefix = 'c2') {
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

function fileUpload(seq) {
    return `<div class="file-row"><label for="file-${seq}">Attach resume (optional)</label><input type="file" id="file-${seq}" name="file-${seq}" accept=".pdf,.doc"></div>`;
}

function continueBtn(text = 'Continue') {
    return `<button type="button">${text}</button>`;
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
        page_url: `https://example.test/forms/${id}`,
        page_title: title,
        notes: options.notes || `${category} bulk corpus fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function buildTeamtailor(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'tt');

    return {
        html: shell(`Teamtailor apply ${seq}`, `
<main class="careers-page"><h1 class="job-title">Apply — Role ${seq}</h1>
<form class="apply-form" action="/apply" method="post" data-teamtailor-form="application">
<section class="form-section" data-section="personal">
${contact.html.replace(/<label/g, '<div class="form-group"><label class="form-label"').replace(/<input/g, '</div><input class="form-control"')}
</section>
<section class="form-section" data-section="questions">
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
</section>
${fileUpload(seq)}
<button type="submit" class="btn btn-primary">Submit application</button>
</form></main>`),
        title: `Teamtailor apply ${seq}`,
    };
}

function buildBamboohr(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'bb');

    return {
        html: formWrap(`BambooHR apply ${seq}`, `
<div class="BambooHR-ATS-Form" data-bamboohr-application="true">
<div class="field-group">${contact.html.replace(/<label/g, '<label class="field-label"').replace(/<input/g, '<input class="field-input"')}</div>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 450)}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, ['LinkedIn', 'Referral', 'Company site', 'Job board'])}
${fileUpload(seq)}
<button type="button" class="btn-submit">Apply now</button>
</div>`),
        title: `BambooHR apply ${seq}`,
    };
}

function buildWorkable(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'wk');

    return {
        html: shell(`Workable apply ${seq}`, `
<main data-workable-application="true"><h1>Apply for position ${seq}</h1>
<form class="application-form workable-form" action="/apply" method="post">
<div class="section personal-details">${contact.html}</div>
<div class="section additional">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 600)}</div>
<div class="section preferences">${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No', 'Maybe'])}</div>
${fileUpload(seq)}
<button type="button">Send application</button>
</form></main>`),
        title: `Workable apply ${seq}`,
    };
}

function buildJobvite(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'jv');

    return {
        html: formWrap(`Jobvite apply ${seq}`, `
<div class="jv-application" id="jv-app-${seq}">
${contact.html.replace(/class="field-row"/g, 'class="jv-field"')}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${continueBtn('Next')}
</div>`),
        title: `Jobvite apply ${seq}`,
    };
}

function buildPersonio(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'pe');

    return {
        html: shell(`Personio apply ${seq}`, `
<main class="personio-application"><h1>Bewerbung ${seq}</h1>
<form class="application-form" action="/apply" method="post">
<div class="form-row">${contact.html}</div>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
<button type="submit">Absenden</button>
</form></main>`),
        title: `Personio apply ${seq}`,
    };
}

function buildRecruitee(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'rc');

    return {
        html: formWrap(`Recruitee apply ${seq}`, `
<div class="recruitee-form" data-offer-id="${seq}">
${contact.html}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${fileUpload(seq)}
</div>`),
        title: `Recruitee apply ${seq}`,
    };
}

function buildIcims(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'ic');
    const ref = (label) => `icims_${slugify(label).slice(0, 12)}_${seq}`;

    return {
        html: formWrap(`iCIMS apply ${seq}`, `
<div class="iCIMS_ApplicationForm" data-icims-form="application">
<div class="iCIMS_Field" data-field="${ref(contact.labels.name)}"><label for="${ref(contact.labels.name)}">${contact.labels.name}</label><input id="${ref(contact.labels.name)}" name="${ref(contact.labels.name)}" type="text"></div>
<div class="iCIMS_Field" data-field="${ref(contact.labels.email)}"><label for="${ref(contact.labels.email)}">${contact.labels.email}</label><input id="${ref(contact.labels.email)}" name="${ref(contact.labels.email)}" type="email"></div>
<div class="iCIMS_Field" data-field="${ref(contact.labels.phone)}"><label for="${ref(contact.labels.phone)}">${contact.labels.phone}</label><input id="${ref(contact.labels.phone)}" name="${ref(contact.labels.phone)}" type="tel"></div>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, ['LinkedIn', 'Referral', 'Other'])}
</div>`),
        title: `iCIMS apply ${seq}`,
    };
}

function buildTaleo(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'tl');

    return {
        html: formWrap(`Taleo apply ${seq}`, `
<div class="taleo-page" data-career-section="apply">
<table class="taleo-form-table"><tbody>
<tr><td><label>${contact.labels.name}</label></td><td><input name="taleo-name-${seq}" type="text"></td></tr>
<tr><td><label>${contact.labels.email}</label></td><td><input name="taleo-email-${seq}" type="email"></td></tr>
<tr><td><label>${contact.labels.phone}</label></td><td><input name="taleo-phone-${seq}" type="tel"></td></tr>
</tbody></table>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}
${continueBtn('Save and continue')}
</div>`),
        title: `Taleo apply ${seq}`,
    };
}

function buildSuccessFactors(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'sf');

    return {
        html: formWrap(`SuccessFactors apply ${seq}`, `
<div class="sapSuccessFactors" data-sf-application="${seq}">
<div class="sf-form-section">${contact.html}</div>
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
</div>`),
        title: `SuccessFactors apply ${seq}`,
    };
}

function buildOracle(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'or');

    return {
        html: formWrap(`Oracle Cloud apply ${seq}`, `
<div class="oracle-application-flow" data-oracle-careers="${seq}">
<section aria-label="Contact information">${contact.html}</section>
<section aria-label="Additional questions">
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 450)}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, ['Website', 'LinkedIn', 'Referral', 'Other'])}
</section>
${continueBtn('Continue application')}
</div>`),
        title: `Oracle Cloud apply ${seq}`,
    };
}

function buildGeneric(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'gen');
    const variants = [
        () => formWrap(`Generic apply ${seq}`, `${contact.html}${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}${fileUpload(seq)}`),
        () => formWrap(`Generic minimal ${seq}`, `${contact.html}${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 3))}`),
        () => shell(`Generic nested ${seq}`, `<main><h1>Apply ${seq}</h1><form action="/apply" method="post"><div><div>${contact.html}</div><div>${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}</div></div></form></main>`),
    ];

    return { html: pick(rng, variants)(), title: `Generic apply ${seq}` };
}

function buildBootstrap(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'bs');

    return {
        html: shell(`Bootstrap apply ${seq}`, `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
<main class="container py-4"><h1 class="h3">Apply ${seq}</h1>
<form class="row g-3" action="/apply" method="post">
<div class="col-12">${contact.html.replace(/<label/g, '<label class="form-label"').replace(/<input/g, '<input class="form-control"')}</div>
<div class="col-12">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500).replace(/class="field-row"/g, 'class="mb-3"')}</div>
<div class="col-md-6">${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4)).replace(/class="field-row"/g, 'class="mb-3"')}</div>
<button type="submit" class="btn btn-primary">Submit</button>
</form></main>`),
        title: `Bootstrap apply ${seq}`,
    };
}

function buildTailwind(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'tw');

    return {
        html: shell(`Tailwind apply ${seq}`, `
<main class="mx-auto max-w-xl p-6"><h1 class="text-2xl font-bold mb-4">Apply ${seq}</h1>
<form class="space-y-4" action="/apply" method="post">
${contact.html.replace(/<label/g, '<label class="block text-sm font-medium"').replace(/<input/g, '<input class="mt-1 block w-full rounded border px-3 py-2"')}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400).replace(/class="field-row"/g, 'class="space-y-1"')}
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}
</form></main>`),
        title: `Tailwind apply ${seq}`,
    };
}

function buildMaterial(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'md');

    return {
        html: formWrap(`Material apply ${seq}`, `
<div class="mdc-form">
<mat-form-field appearance="outline"><label for="md-name-${seq}">${contact.labels.name}</label><input matInput id="md-name-${seq}" name="md-name-${seq}" type="text"></mat-form-field>
<mat-form-field appearance="outline"><label for="md-email-${seq}">${contact.labels.email}</label><input matInput id="md-email-${seq}" name="md-email-${seq}" type="email"></mat-form-field>
<mat-form-field appearance="outline"><label for="md-phone-${seq}">${contact.labels.phone}</label><input matInput id="md-phone-${seq}" name="md-phone-${seq}" type="tel"></mat-form-field>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
</div>`),
        title: `Material apply ${seq}`,
    };
}

function buildNested(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'ns');

    return {
        html: formWrap(`Nested fieldsets ${seq}`, `
<fieldset><legend>Personal details</legend>${contact.html}</fieldset>
<fieldset><legend>Preferences</legend>${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}</fieldset>
<fieldset><legend>Additional</legend>${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}</fieldset>`),
        title: `Nested fieldsets ${seq}`,
    };
}

function buildTable(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'tb');

    return {
        html: formWrap(`Table layout ${seq}`, `
<table class="apply-table" role="presentation">
<tr><th scope="row"><label for="tb-name-${seq}">${contact.labels.name}</label></th><td><input id="tb-name-${seq}" name="tb-name-${seq}" type="text"></td></tr>
<tr><th scope="row"><label for="tb-email-${seq}">${contact.labels.email}</label></th><td><input id="tb-email-${seq}" name="tb-email-${seq}" type="email"></td></tr>
<tr><th scope="row"><label for="tb-phone-${seq}">${contact.labels.phone}</label></th><td><input id="tb-phone-${seq}" name="tb-phone-${seq}" type="tel"></td></tr>
<tr><th scope="row">${pick(rng, COVERS)} (${seq})</th><td><textarea name="tb-cover-${seq}" rows="4" maxlength="500"></textarea></td></tr>
</table>`),
        title: `Table layout ${seq}`,
    };
}

function buildDl(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'dl');

    return {
        html: formWrap(`Definition list ${seq}`, `
<dl class="apply-dl">
<dt><label for="dl-name-${seq}">${contact.labels.name}</label></dt><dd><input id="dl-name-${seq}" name="dl-name-${seq}" type="text"></dd>
<dt><label for="dl-email-${seq}">${contact.labels.email}</label></dt><dd><input id="dl-email-${seq}" name="dl-email-${seq}" type="email"></dd>
<dt><label for="dl-phone-${seq}">${contact.labels.phone}</label></dt><dd><input id="dl-phone-${seq}" name="dl-phone-${seq}" type="tel"></dd>
<dt>${pick(rng, COVERS)} (${seq})</dt><dd><textarea name="dl-cover-${seq}" rows="4"></textarea></dd>
</dl>`),
        title: `Definition list ${seq}`,
    };
}

function buildPlain(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'pl');

    return {
        html: formWrap(`Plain HTML ${seq}`, `${contact.html}${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 300)}`),
        title: `Plain HTML ${seq}`,
    };
}

function buildGov(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'gv');

    return {
        html: shell(`Government apply ${seq}`, `
<main class="govuk-main-wrapper"><h1 class="govuk-heading-xl">Application form ${seq}</h1>
<form class="govuk-form" action="/apply" method="post">
<div class="govuk-form-group">${contact.html.replace(/<label/g, '<label class="govuk-label"').replace(/<input/g, '<input class="govuk-input"')}</div>
<div class="govuk-form-group">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 600).replace(/class="field-row"/g, '')}</div>
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
<button type="submit" class="govuk-button">Continue</button>
</form></main>`),
        title: `Government apply ${seq}`,
    };
}

function buildNonprofit(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'np');

    return {
        html: formWrap(`Nonprofit volunteer ${seq}`, `
<div class="volunteer-application">
<p class="intro">Thank you for your interest in volunteering.</p>
${contact.html}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}
${fieldsetRadio('Available for weekend shifts?', seq, ['Yes', 'No', 'Sometimes'])}
</div>`),
        title: `Nonprofit volunteer ${seq}`,
    };
}

function buildMultipart(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'mp');

    return {
        html: formWrap(`Multipart apply ${seq}`, `${contact.html}${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}${fileUpload(seq)}`, 'action="/apply" method="post" enctype="multipart/form-data"'),
        title: `Multipart apply ${seq}`,
    };
}

function buildJotform(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'jf');

    return {
        html: shell(`Jotform-style ${seq}`, `
<main class="jotform-form" data-jotform-id="${seq}"><h1>Job application ${seq}</h1>
<form class="form-all" action="/apply" method="post">
<ul class="form-section"><li class="form-line">${contact.html.replace(/<div class="field-row"/g, '<div class="form-input-wide"')}</li>
<li class="form-line">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}</li>
<li class="form-line">${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, ['LinkedIn', 'Friend', 'Search', 'Other'])}</li></ul>
<button type="submit" class="form-submit-button">Submit</button>
</form></main>`),
        title: `Jotform-style ${seq}`,
    };
}

function buildSmartRecruiters(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'sr');

    return {
        html: shell(`SmartRecruiters apply ${seq}`, `
<main data-sr-application="true"><h1>Apply ${seq}</h1>
<form class="sr-form" action="/apply" method="post">
<section class="sr-section" data-section="contact">${contact.html}</section>
<section class="sr-section" data-section="questions">
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
</section>
${continueBtn('Continue application')}
</form></main>`),
        title: `SmartRecruiters apply ${seq}`,
    };
}

function buildLever(index, seq, rng) {
    const contact = contactBlock(seq, rng, 'lv');

    return {
        html: formWrap(`Lever apply ${seq}`, `
<div class="application-form lever-form">
<div class="application-field"><label class="application-label">${contact.labels.name}</label><input name="lever-name-${seq}" type="text" id="lever-name-${seq}"></div>
<div class="application-field"><label class="application-label">${contact.labels.email}</label><input name="lever-email-${seq}" type="email" id="lever-email-${seq}"></div>
<div class="application-field"><label class="application-label">${contact.labels.phone}</label><input name="lever-phone-${seq}" type="tel" id="lever-phone-${seq}"></div>
<div class="application-field"><label class="application-label">${pick(rng, COVERS)} (${seq})</label><textarea name="lever-cover-${seq}" id="lever-cover-${seq}" rows="4" maxlength="500"></textarea></div>
${fileUpload(seq)}
<button type="button">Submit application</button>
</div>`),
        title: `Lever apply ${seq}`,
    };
}

/** @type {Array<{ prefix: string, count: number, category: string, build: typeof buildTeamtailor }>} */
const BATCHES = [
    { prefix: 'syn-corpus2-teamtailor', count: 28, category: 'corpus2-teamtailor', build: buildTeamtailor },
    { prefix: 'syn-corpus2-bamboohr', count: 28, category: 'corpus2-bamboohr', build: buildBamboohr },
    { prefix: 'syn-corpus2-workable', count: 24, category: 'corpus2-workable', build: buildWorkable },
    { prefix: 'syn-corpus2-jobvite', count: 24, category: 'corpus2-jobvite', build: buildJobvite },
    { prefix: 'syn-corpus2-personio', count: 24, category: 'corpus2-personio', build: buildPersonio },
    { prefix: 'syn-corpus2-recruitee', count: 24, category: 'corpus2-recruitee', build: buildRecruitee },
    { prefix: 'syn-corpus2-icims', count: 24, category: 'corpus2-icims', build: buildIcims },
    { prefix: 'syn-corpus2-taleo', count: 20, category: 'corpus2-taleo', build: buildTaleo },
    { prefix: 'syn-corpus2-successfactors', count: 20, category: 'corpus2-successfactors', build: buildSuccessFactors },
    { prefix: 'syn-corpus2-oracle', count: 20, category: 'corpus2-oracle', build: buildOracle },
    { prefix: 'syn-corpus2-generic', count: 32, category: 'corpus2-generic', build: buildGeneric },
    { prefix: 'syn-corpus2-bootstrap', count: 24, category: 'corpus2-bootstrap', build: buildBootstrap },
    { prefix: 'syn-corpus2-tailwind', count: 24, category: 'corpus2-tailwind', build: buildTailwind },
    { prefix: 'syn-corpus2-material', count: 24, category: 'corpus2-material', build: buildMaterial },
    { prefix: 'syn-corpus2-nested', count: 20, category: 'corpus2-nested', build: buildNested },
    { prefix: 'syn-corpus2-table', count: 20, category: 'corpus2-table', build: buildTable },
    { prefix: 'syn-corpus2-dl', count: 15, category: 'corpus2-dl', build: buildDl },
    { prefix: 'syn-corpus2-plain', count: 18, category: 'corpus2-plain', build: buildPlain },
    { prefix: 'syn-corpus2-gov', count: 18, category: 'corpus2-gov', build: buildGov },
    { prefix: 'syn-corpus2-nonprofit', count: 21, category: 'corpus2-nonprofit', build: buildNonprofit },
    { prefix: 'syn-corpus2-multipart', count: 10, category: 'corpus2-multipart', build: buildMultipart },
    { prefix: 'syn-corpus2-jotform', count: 18, category: 'corpus2-jotform', build: buildJotform },
    { prefix: 'syn-corpus2-smartrec', count: 10, category: 'corpus2-smartrecruiters', build: buildSmartRecruiters },
    { prefix: 'syn-corpus2-lever', count: 10, category: 'corpus2-lever', build: buildLever },
];

let generated = 0;
let globalSeq = 20_000;

for (const batch of BATCHES) {
    for (let i = 0; i < batch.count; i += 1) {
        globalSeq += 1;
        const id = `${batch.prefix}-${String(i + 1).padStart(3, '0')}`;
        const rng = createRng(globalSeq * 3571);
        const result = batch.build(i, globalSeq, rng);
        addScenario(id, batch.category, result.title, result.html, {
            notes: result.notes,
            requiresInteraction: result.requiresInteraction ?? false,
            interactionSteps: result.interactionSteps ?? [],
        });
        generated += 1;
    }
}

saveManifest(manifest);

const batchSummary = BATCHES.map((b) => `${b.prefix}: ${b.count}`).join('\n  ');
console.log(`Generated ${generated} bulk corpus scenarios in ${HTML_DIR}`);
console.log(`Categories:\n  ${batchSummary}`);
console.log(`Manifest: ${MANIFEST_PATH} (${manifest.scenarios.length} total scenarios)`);
