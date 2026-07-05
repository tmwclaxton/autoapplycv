#!/usr/bin/env node
/**
 * Generate 1000 synthetic mega-form fixtures (syn-mega-*).
 * Parametric templates with seeded randomness - no Firecrawl.
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

const NAMES = ['Full name', 'Legal name', 'Applicant name', 'Your name', 'Preferred name', 'Complete name'];
const EMAILS = ['Email address', 'Work email', 'Contact email', 'Personal email', 'Primary email', 'Application email'];
const PHONES = ['Phone number', 'Mobile number', 'Contact number', 'Telephone', 'Cell phone', 'Direct line'];
const COVERS = ['Cover letter', 'Why this role?', 'Tell us about yourself', 'Motivation statement', 'Personal statement'];
const LOCATIONS = ['Preferred location', 'Work location', 'Office preference', 'Where are you based?', 'Current city'];
const SKILLS = ['Key skills', 'Technical skills', 'Primary expertise', 'Core competencies', 'Skill highlights'];
const START_DATES = ['Earliest start date', 'Available from', 'Start date preference', 'When can you start?'];
const REFERRALS = ['How did you hear about us?', 'Referral source', 'Application source', 'Discovery channel'];
const VISAS = ['Do you require visa sponsorship?', 'Visa sponsorship needed?', 'Work authorization status'];
const RELOCATES = ['Open to relocation?', 'Willing to relocate?', 'Relocation preference'];
const PORTFOLIOS = ['Portfolio URL', 'Personal website', 'GitHub profile', 'Work samples link'];

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

function contactBlock(seq, rng, prefix = 'mega') {
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

function ariaRadiogroup(label, seq, options) {
    const gid = slugify(`${label}-${seq}`).slice(0, 24);

    return `<div role="radiogroup" aria-labelledby="${gid}-lbl" id="${gid}">
<span id="${gid}-lbl">${label}</span>
${options.map((opt, i) => `<div role="radio" tabindex="${i === 0 ? 0 : -1}" aria-checked="false" data-value="${slugify(opt)}">${opt}</div>`).join('')}
</div>`;
}

function ariaCheckboxGroup(label, seq, options) {
    const gid = slugify(`${label}-${seq}`).slice(0, 24);

    return `<div role="group" id="${gid}" aria-labelledby="${gid}-lbl">
<span id="${gid}-lbl">${label}</span>
${options.map((opt) => `<div role="checkbox" aria-checked="false" tabindex="0">${opt}</div>`).join('')}
</div>`;
}

function visibleListbox(label, seq, options) {
    const listId = `listbox-${seq}`;

    return `
<div class="field-row">
<span id="${listId}-lbl">${label}</span>
<div role="combobox" aria-expanded="true" aria-controls="${listId}" aria-labelledby="${listId}-lbl" tabindex="0">${label}</div>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl">
${options.map((o) => `<div role="option" data-value="${slugify(o)}">${o}</div>`).join('')}
</div>
</div>`;
}

function hiddenListbox(label, seq, options, triggerClass = 'custom-dropdown-trigger') {
    const listId = `listbox-h-${seq}`;

    return `
<div class="field-row">
<span id="${listId}-lbl">${label}</span>
<button type="button" class="${triggerClass}" role="combobox" aria-expanded="false" aria-controls="${listId}" aria-labelledby="${listId}-lbl" data-reveal="#${listId}">Select ${label.toLowerCase()}</button>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
${options.map((o) => `<div role="option" data-value="${slugify(o)}">${o}</div>`).join('')}
</div>
</div>`;
}

function hiddenDatePicker(label, seq) {
    const panelId = `date-panel-${seq}`;
    const inputId = `date-input-${seq}`;

    return `
<label for="date-trigger-${seq}">${label}</label>
<button type="button" id="date-trigger-${seq}" aria-haspopup="dialog" aria-controls="${panelId}" data-reveal="#${panelId}">Choose date</button>
<div id="${panelId}" role="dialog" hidden style="display:none" aria-label="${label}">
<label for="${inputId}">${label}</label>
<input type="date" id="${inputId}" name="${inputId}">
</div>`;
}

function hiddenRevealPanel(seq, fieldsHtml, buttonText = 'Show more questions') {
    const panelId = `reveal-${seq}`;

    return `
<button type="button" id="reveal-btn-${seq}" data-reveal="#${panelId}">${buttonText}</button>
<div id="${panelId}" hidden style="display:none">${fieldsHtml}</div>`;
}

function fileUploadDecor(seq) {
    return `<div class="file-row"><label for="file-upload-${seq}">Attach resume (optional)</label><input type="file" id="file-upload-${seq}" name="file-upload-${seq}" accept=".pdf,.doc"></div>`;
}

function intlTelBlock(label, seq) {
    const inputId = `intl-phone-${seq}`;
    const listId = `iti-list-${seq}`;

    return `
<div class="iti iti--allow-dropdown">
<label for="${inputId}">${label}</label>
<div class="iti__country-container">
<button type="button" class="iti__selected-country" aria-label="Select country code" aria-controls="${listId}" aria-expanded="false">+44</button>
<ul role="listbox" id="${listId}" class="iti__country-list" aria-label="List of countries" hidden style="display:none">
<li role="option" data-dial-code="44">United Kingdom +44</li>
<li role="option" data-dial-code="1">United States +1</li>
<li role="option" data-dial-code="353">Ireland +353</li>
</ul>
</div>
<input type="tel" id="${inputId}" name="${inputId}" autocomplete="tel">
</div>`;
}

function iframeNoise(seq) {
    const srcdoc = `<!DOCTYPE html><html><body><form><label>Internal ref ${seq}</label><input name="ref-${seq}" type="text"></form></body></html>`;

    return `<iframe title="Embedded module ${seq}" srcdoc="${srcdoc.replace(/"/g, '&quot;')}" width="320" height="120"></iframe>`;
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
        notes: options.notes || `${category} mega synthetic fixture`,
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

const LOC_OPTS = ['London', 'Remote', 'Hybrid', 'Manchester', 'Berlin', 'Dublin'];
const SKILL_OPTS = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'SQL'];

/** @type {Array<{ prefix: string, count: number, category: string, build: (index: number, globalSeq: number) => { html: string, title: string, requiresInteraction?: boolean, interactionSteps?: Array<{ action: string, selector?: string, text?: string }> } }>} */
const BATCHES = [
    {
        prefix: 'syn-mega-vue',
        count: 55,
        category: 'mega-vue',
        build(index, seq) {
            const rng = createRng(seq * 7919);
            const scope = `data-v-${String(10000 + seq).slice(1)}`;
            const contact = contactBlock(seq, rng, 'vue');
            const cover = `${pick(rng, COVERS)} (${seq})`;
            const variants = [
                () => formWrap(`Vue apply ${seq}`, `
<div id="app" ${scope}>
<div class="application-form ${scope}">
${contact.html}
${labeledTextarea(cover, seq, 500)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${fileUploadDecor(seq)}
${continueBtn('Save and continue')}
</div>
</div>`),
                () => formWrap(`Vue portal ${seq}`, `
<div id="app" ${scope}>
${contact.html}
<div id="teleport-target"><div class="portal-actions ${scope}" role="group" aria-label="Actions">${continueBtn('Next step')}</div></div>
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No', 'Maybe later'])}
</div>`),
                () => shell(`Vue grid ${seq}`, `
<main ${scope}><h1>Vue grid ${seq}</h1>
<form action="/apply" method="post">
<div class="grid-form ${scope}" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
<div class="col-span-2">${contact.html}</div>
<div class="col-span-2">${visibleListbox(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}</div>
</div>
</form></main>`),
            ];

            return { html: pick(rng, variants)(), title: `Vue apply ${seq}` };
        },
    },
    {
        prefix: 'syn-mega-react',
        count: 55,
        category: 'mega-react',
        build(index, seq) {
            const rng = createRng(seq * 6271);
            const contact = contactBlock(seq, rng, 'react');
            const cover = `${pick(rng, COVERS)} (${seq})`;

            return {
                html: formWrap(`React apply ${seq}`, `
<div id="root" data-reactroot="">
<div class="App">
<div class="component FormSection" role="group" aria-label="Contact details">
${contact.html}
</div>
<div class="component Field">${labeledTextarea(cover, seq, 400)}</div>
${ariaRadiogroup(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}
${continueBtn('Continue')}
</div>
</div>`),
                title: `React apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-svelte',
        count: 50,
        category: 'mega-svelte',
        build(index, seq) {
            const rng = createRng(seq * 5381);
            const hash = String(20000 + seq * 13).slice(1, 6);
            const contact = contactBlock(seq, rng, 'sv');
            const cls = `svelte-${hash}`;

            return {
                html: formWrap(`Svelte apply ${seq}`, `
<div class="application ${cls}">
${contact.html.replace(/<label/g, `<div class="field ${cls}"><label class="${cls}"`).replace(/<input/g, `</div><input class="${cls}"`)}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 350)}
${index % 2 === 0 ? fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No']) : labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
</div>`),
                title: `Svelte apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-angular',
        count: 60,
        category: 'mega-angular',
        build(index, seq) {
            const rng = createRng(seq * 4177);
            const contact = contactBlock(seq, rng, 'ang');
            const nameL = contact.labels.name;
            const emailL = contact.labels.email;
            const phoneL = contact.labels.phone;

            return {
                html: shell(`Angular apply ${seq}`, `
<main ng-app="apply"><h1>Angular Application ${seq}</h1>
<form ngNoForm class="application-form" action="/apply" method="post" novalidate>
<mat-form-field appearance="outline"><mat-label>${nameL}</mat-label><label for="ang-name-${seq}">${nameL}</label><input matInput id="ang-name-${seq}" name="ang-name-${seq}" type="text"></mat-form-field>
<mat-form-field appearance="outline"><mat-label>${emailL}</mat-label><label for="ang-email-${seq}">${emailL}</label><input matInput id="ang-email-${seq}" name="ang-email-${seq}" type="email"></mat-form-field>
<mat-form-field appearance="outline"><mat-label>${phoneL}</mat-label><label for="ang-phone-${seq}">${phoneL}</label><input matInput id="ang-phone-${seq}" name="ang-phone-${seq}" type="tel"></mat-form-field>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
<button mat-button type="button">Continue</button>
</form></main>`),
                title: `Angular apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-next',
        count: 40,
        category: 'mega-next',
        build(index, seq) {
            const rng = createRng(seq * 3571);
            const contact = contactBlock(seq, rng, 'next');

            return {
                html: shell(`Next apply ${seq}`, `
<div id="__next"><main class="jsx-application"><h1>Next.js apply ${seq}</h1>
<form action="/apply" method="post" data-nextjs-scroll-focus-boundary="true">
${contact.html}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 450)}
<div class="next-portal-root">${fieldsetRadio(`${pick(rng, REFERRALS)} (${seq})`, seq, ['LinkedIn', 'Referral', 'Job board'])}</div>
${continueBtn('Continue')}
</form></main></div>`),
                title: `Next apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-nuxt',
        count: 40,
        category: 'mega-nuxt',
        build(index, seq) {
            const rng = createRng(seq * 2999);
            const scope = `data-v-${String(30000 + seq).slice(1)}`;
            const contact = contactBlock(seq, rng, 'nuxt');

            return {
                html: shell(`Nuxt apply ${seq}`, `
<div id="__nuxt"><div ${scope} class="nuxt-page">
<h1>Nuxt apply ${seq}</h1>
<form action="/apply" method="post" ${scope}>
${contact.html}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
${ariaCheckboxGroup(`${pick(rng, SKILLS)} (${seq})`, seq, pickN(rng, SKILL_OPTS, 4))}
</form></div></div>`),
                title: `Nuxt apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-shadow',
        count: 40,
        category: 'mega-shadow',
        build(index, seq) {
            const rng = createRng(seq * 2713);
            const contact = contactBlock(seq, rng, 'light');
            const extraLabel = `${pick(rng, PORTFOLIOS)} (${seq})`;

            return {
                html: shell(`Web component ${seq}`, `
<main><h1>Web component apply ${seq}</h1>
<form action="/apply" method="post">
${contact.html}
<apply-form-widget data-stage="${seq}">
<section class="wc-host" slot="application">
${labeledInput(extraLabel, seq, 'url')}
</section>
</apply-form-widget>
${index % 3 === 0 ? `<apply-form-element id="shadow-host-${seq}"></apply-form-element>
<script>(function(){class ApplyFormElement extends HTMLElement{connectedCallback(){if(this.shadowRoot)return;const s=this.attachShadow({mode:'open'});s.innerHTML='<p data-shadow-note="not traversed">Shadow-only note</p>';}}if(!customElements.get('apply-form-element'))customElements.define('apply-form-element',ApplyFormElement);})();</script>` : ''}
${continueBtn('Continue')}
</form></main>`),
                title: `Web component ${seq}`,
                notes: 'Light DOM fields extractable; open shadow internals not traversed.',
            };
        },
    },
    {
        prefix: 'syn-mega-ashby',
        count: 50,
        category: 'mega-ashby',
        build(index, seq) {
            const rng = createRng(seq * 2357);
            const contact = contactBlock(seq, rng, 'ashby');

            return {
                html: shell(`Ashby-style ${seq}`, `
<main class="_container_ud4nd_29"><h1 class="_title_ud4nd_47">Apply - Role ${seq}</h1>
<form class="_applicationForm_ud4nd_61" action="/apply" method="post">
${contact.html.replace(/<label/g, '<div class="_fieldEntry_ud4nd_85"><label class="_label_ud4nd_91"').replace(/<input/g, '</div><input class="_input_ud4nd_97"')}
<div class="_questionField_ud4nd_103">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}</div>
<div class="_questionField_ud4nd_103">${fieldsetRadio(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No'])}</div>
<button type="button" class="_submitButton_ud4nd_115">Submit application</button>
</form></main>`),
                title: `Ashby-style ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-greenhouse',
        count: 50,
        category: 'mega-greenhouse',
        build(index, seq) {
            const rng = createRng(seq * 2111);
            const contact = contactBlock(seq, rng, 'gh');

            return {
                html: formWrap(`Greenhouse-style ${seq}`, `
<div id="application" class="application--container">
${contact.html.replace(/<label for="([^"]+)">([^<]+)<\/label>\s*<input/g, '<div class="field"><label id="$1-label" for="$1">$2</label><input aria-labelledby="$1-label"')}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 600)}
${labeledSelect(`${pick(rng, REFERRALS)} (${seq})`, seq, ['LinkedIn', 'Referral', 'Company site', 'Other'])}
${fileUploadDecor(seq)}
</div>`),
                title: `Greenhouse-style ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-lever',
        count: 40,
        category: 'mega-lever',
        build(index, seq) {
            const rng = createRng(seq * 1973);
            const contact = contactBlock(seq, rng, 'lever');
            const c = contact.labels;

            return {
                html: formWrap(`Lever-style ${seq}`, `
<div class="application-form">
<div class="application-field"><label class="application-label">${c.name}</label><input name="lever-name-${seq}" type="text" id="lever-name-${seq}"></div>
<div class="application-field"><label class="application-label">${c.email}</label><input name="lever-email-${seq}" type="email" id="lever-email-${seq}"></div>
<div class="application-field"><label class="application-label">${c.phone}</label><input name="lever-phone-${seq}" type="tel" id="lever-phone-${seq}"></div>
<div class="application-field"><label class="application-label">${pick(rng, COVERS)} (${seq})</label><textarea name="lever-cover-${seq}" id="lever-cover-${seq}" rows="4" maxlength="500"></textarea></div>
${fileUploadDecor(seq)}
<button type="button">Submit application</button>
</div>`),
                title: `Lever-style ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-workday',
        count: 50,
        category: 'mega-workday',
        build(index, seq) {
            const rng = createRng(seq * 1861);
            const contact = contactBlock(seq, rng, 'wd');
            const ref = (label) => `input-q_${slugify(label).slice(0, 14)}`;
            const row = (label, type = 'text') => {
                const r = ref(label);

                return `<div data-testid="${r}" class="ia-Questions-item"><div data-testid="${r}-label"><span data-testid="safe-markup">${label}</span></div><input data-testid="${r}-input" type="${type}" name="${r}-${seq}"></div>`;
            };

            return {
                html: formWrap(`Workday-style ${seq}`, `
<div data-automation-id="applyFlowPrimaryPage">
${row(contact.labels.name)}
${row(contact.labels.email, 'email')}
${row(contact.labels.phone, 'tel')}
<div data-testid="${ref(pick(rng, COVERS))}" class="ia-Questions-item"><div data-testid="${ref(pick(rng, COVERS))}-label"><span data-testid="safe-markup">${pick(rng, COVERS)} (${seq})</span></div><textarea data-testid="${ref(pick(rng, COVERS))}-input" name="wd-cover-${seq}" rows="4" maxlength="600"></textarea></div>
${continueBtn('Save and continue')}
</div>`),
                title: `Workday-style ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-smartrec',
        count: 40,
        category: 'mega-smartrecruiters',
        build(index, seq) {
            const rng = createRng(seq * 1753);
            const contact = contactBlock(seq, rng, 'sr');

            return {
                html: shell(`SmartRecruiters-style ${seq}`, `
<main data-sr-application="true"><h1>Apply ${seq}</h1>
<form class="sr-form" action="/apply" method="post">
<section class="sr-section" data-section="contact">
${contact.html}
</section>
<section class="sr-section" data-section="questions">
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 500)}
${visibleListbox(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
</section>
${continueBtn('Continue application')}
</form></main>`),
                title: `SmartRecruiters-style ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-wizard',
        count: 50,
        category: 'mega-wizard',
        build(index, seq) {
            const rng = createRng(seq * 1657);
            const contact = contactBlock(seq, rng, 'wiz');

            return {
                html: formWrap(`Wizard apply ${seq}`, `
<div class="wizard" data-step="1">
<nav aria-label="Application progress"><ol><li aria-current="step">Contact</li><li>Experience</li><li>Review</li></ol></nav>
<div class="wizard-panel" role="group" aria-labelledby="wizard-step1-${seq}">
<h2 id="wizard-step1-${seq}">Contact information</h2>
${contact.html}
</div>
<div class="wizard-panel" aria-hidden="true" style="display:none"><p>Experience step hidden</p></div>
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400)}
${continueBtn('Continue')}
</div>`),
                title: `Wizard apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-conditional',
        count: 40,
        category: 'mega-conditional',
        build(index, seq) {
            const rng = createRng(seq * 1543);
            const contact = contactBlock(seq, rng, 'cond');
            const hiddenFields = labeledInput(`${pick(rng, PORTFOLIOS)} (${seq})`, seq, 'url')
                + labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 400);

            return {
                html: formWrap(`Conditional ${seq}`, `
<div role="group" aria-labelledby="step1-label-${seq}"><p id="step1-label-${seq}">Step 1 - Contact</p>${contact.html}</div>
${hiddenRevealPanel(seq, hiddenFields, 'Show optional questions')}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
`),
                title: `Conditional ${seq}`,
                requiresInteraction: true,
                interactionSteps: [{ action: 'click', text: 'show optional' }],
            };
        },
    },
    {
        prefix: 'syn-mega-listbox',
        count: 30,
        category: 'mega-aria-listbox',
        build(index, seq) {
            const rng = createRng(seq * 1429);
            const contact = contactBlock(seq, rng, 'lb');
            const loc = `${pick(rng, LOCATIONS)} (${seq})`;
            const hidden = index % 2 === 1;

            return {
                html: formWrap(`Listbox ${seq}`, `${contact.html}${hidden ? hiddenListbox(loc, seq, pickN(rng, LOC_OPTS, 4)) : visibleListbox(loc, seq, pickN(rng, LOC_OPTS, 4))}`),
                title: `Listbox ${seq}`,
                requiresInteraction: hidden,
                interactionSteps: hidden ? [{ action: 'click', selector: '.custom-dropdown-trigger' }] : [],
            };
        },
    },
    {
        prefix: 'syn-mega-combobox',
        count: 30,
        category: 'mega-aria-combobox',
        build(index, seq) {
            const rng = createRng(seq * 1327);
            const contact = contactBlock(seq, rng, 'cb');
            const loc = `${pick(rng, LOCATIONS)} (${seq})`;
            const listId = `combo-list-${seq}`;

            return {
                html: formWrap(`Combobox ${seq}`, `${contact.html}
<span id="${listId}-lbl">${loc}</span>
<button type="button" role="combobox" aria-expanded="false" aria-controls="${listId}" aria-labelledby="${listId}-lbl" data-reveal="#${listId}">Open ${loc.toLowerCase()}</button>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
${pickN(rng, LOC_OPTS, 4).map((o) => `<div role="option">${o}</div>`).join('')}
</div>`),
                title: `Combobox ${seq}`,
                requiresInteraction: true,
                interactionSteps: [{ action: 'click', selector: '[role="combobox"]' }],
            };
        },
    },
    {
        prefix: 'syn-mega-radiogroup',
        count: 30,
        category: 'mega-aria-radiogroup',
        build(index, seq) {
            const rng = createRng(seq * 1223);
            const contact = contactBlock(seq, rng, 'rg');

            return {
                html: formWrap(`Radiogroup ${seq}`, `${contact.html}${ariaRadiogroup(`${pick(rng, VISAS)} (${seq})`, seq, ['Yes', 'No', 'Not applicable'])}`),
                title: `Radiogroup ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-checkbox',
        count: 30,
        category: 'mega-aria-checkbox',
        build(index, seq) {
            const rng = createRng(seq * 1129);
            const contact = contactBlock(seq, rng, 'chk');
            const skills = `${pick(rng, SKILLS)} (${seq})`;
            const hidden = index % 2 === 1;

            if (hidden) {
                const panelId = `skills-panel-${seq}`;
                const groupId = `skills-group-${seq}`;

                return {
                    html: formWrap(`Checkbox hidden ${seq}`, `${contact.html}
<button type="button" id="show-skills-${seq}" data-reveal="#${panelId}" aria-expanded="false">Show skill options</button>
<div id="${panelId}" hidden style="display:none">
<div role="group" id="${groupId}" aria-labelledby="${groupId}-lbl">
<span id="${groupId}-lbl">${skills}</span>
${pickN(rng, SKILL_OPTS, 4).map((s) => `<div role="checkbox" aria-checked="false">${s}</div>`).join('')}
</div>
</div>`),
                    title: `Checkbox hidden ${seq}`,
                    requiresInteraction: true,
                    interactionSteps: [{ action: 'click', text: 'show skill' }],
                };
            }

            return {
                html: formWrap(`Checkbox visible ${seq}`, `${contact.html}${ariaCheckboxGroup(skills, seq, pickN(rng, SKILL_OPTS, 4))}`),
                title: `Checkbox visible ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-group',
        count: 20,
        category: 'mega-aria-group',
        build(index, seq) {
            const rng = createRng(seq * 1031);
            const contact = contactBlock(seq, rng, 'grp');

            return {
                html: formWrap(`Role group ${seq}`, `${contact.html}
<div role="group" aria-labelledby="pref-lbl-${seq}">
<span id="pref-lbl-${seq}">Work preferences (${seq})</span>
${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}
</div>`),
                title: `Role group ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-dropdown',
        count: 30,
        category: 'mega-dropdown-hidden',
        build(index, seq) {
            const rng = createRng(seq * 997);
            const contact = contactBlock(seq, rng, 'dd');

            return {
                html: formWrap(`Dropdown reveal ${seq}`, `${contact.html}${hiddenListbox(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}`),
                title: `Dropdown reveal ${seq}`,
                requiresInteraction: true,
                interactionSteps: [{ action: 'click', selector: '.custom-dropdown-trigger' }],
            };
        },
    },
    {
        prefix: 'syn-mega-date',
        count: 30,
        category: 'mega-datepicker',
        build(index, seq) {
            const rng = createRng(seq * 919);
            const contact = contactBlock(seq, rng, 'dt');
            const label = `${pick(rng, START_DATES)} (${seq})`;

            return {
                html: formWrap(`Datepicker ${seq}`, `${contact.html}${hiddenDatePicker(label, seq)}`),
                title: `Datepicker ${seq}`,
                requiresInteraction: true,
                interactionSteps: [{ action: 'click', text: 'choose date' }],
            };
        },
    },
    {
        prefix: 'syn-mega-chips',
        count: 20,
        category: 'mega-chips',
        build(index, seq) {
            const rng = createRng(seq * 877);
            const contact = contactBlock(seq, rng, 'chip');
            const skills = `${pick(rng, SKILLS)} (${seq})`;
            const panelId = `chip-panel-${seq}`;
            const groupId = `chip-group-${seq}`;

            return {
                html: formWrap(`Chips ${seq}`, `${contact.html}
<button type="button" data-reveal="#${panelId}">Select skills</button>
<div id="${panelId}" hidden style="display:none">
<div role="group" aria-labelledby="${groupId}-lbl" id="${groupId}">
<span id="${groupId}-lbl">${skills}</span>
${pickN(rng, SKILL_OPTS, 4).map((s) => `<span role="checkbox" aria-checked="false">${s}</span>`).join('')}
</div>
</div>`),
                title: `Chips ${seq}`,
                requiresInteraction: true,
                interactionSteps: [{ action: 'click', text: 'select skills' }],
            };
        },
    },
    {
        prefix: 'syn-mega-iframe',
        count: 20,
        category: 'mega-iframe',
        build(index, seq) {
            const rng = createRng(seq * 811);
            const contact = contactBlock(seq, rng, 'if');

            return {
                html: shell(`Iframe apply ${seq}`, `
<main><h1>Iframe apply ${seq}</h1>
<form action="/apply" method="post">
${contact.html}
${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 350)}
${continueBtn('Continue')}
</form>
${iframeNoise(seq)}
</main>`),
                title: `Iframe apply ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-grid',
        count: 40,
        category: 'mega-grid-flex',
        build(index, seq) {
            const rng = createRng(seq * 773);
            const contact = contactBlock(seq, rng, 'grid');
            const c = contact.labels;

            return {
                html: formWrap(`Grid layout ${seq}`, `
<div class="grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
<div><label for="grid-name-${seq}">${c.name}</label><span class="helper">Required</span><input id="grid-name-${seq}" name="grid-name-${seq}" type="text"></div>
<div><label for="grid-email-${seq}">${c.email}</label><span class="helper">Required</span><input id="grid-email-${seq}" name="grid-email-${seq}" type="email"></div>
<div style="grid-column:span 2"><label for="grid-phone-${seq}">${c.phone}</label><input id="grid-phone-${seq}" name="grid-phone-${seq}" type="tel"><small class="helper-text">Include country code</small></div>
<div style="grid-column:span 2">${labeledTextarea(`${pick(rng, COVERS)} (${seq})`, seq, 450)}</div>
</div>
<div style="display:flex;flex-wrap:wrap;gap:8px">${fieldsetRadio(`${pick(rng, RELOCATES)} (${seq})`, seq, ['Yes', 'No'])}</div>`),
                title: `Grid layout ${seq}`,
            };
        },
    },
    {
        prefix: 'syn-mega-intl',
        count: 20,
        category: 'mega-intl-tel',
        build(index, seq) {
            const rng = createRng(seq * 719);
            const nameLabel = `${pick(rng, NAMES)} (${seq})`;
            const emailLabel = `${pick(rng, EMAILS)} (${seq})`;
            const phoneLabel = `${pick(rng, PHONES)} (${seq})`;

            return {
                html: formWrap(`Intl tel ${seq}`, `
<label for="intl-name-${seq}">${nameLabel}</label><input type="text" id="intl-name-${seq}" name="intl-name-${seq}">
<label for="intl-email-${seq}">${emailLabel}</label><input type="email" id="intl-email-${seq}" name="intl-email-${seq}">
${intlTelBlock(phoneLabel, seq)}
${labeledSelect(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4))}
`),
                title: `Intl tel ${seq}`,
                notes: 'Country list must not appear as draftable field.',
            };
        },
    },
    {
        prefix: 'syn-mega-disclosure',
        count: 20,
        category: 'mega-disclosure',
        build(index, seq) {
            const rng = createRng(seq * 683);
            const contact = contactBlock(seq, rng, 'disc');
            const panelId = `disclosure-panel-${seq}`;

            return {
                html: formWrap(`Disclosure ${seq}`, `${contact.html}
<button type="button" id="disclosure-${seq}" aria-expanded="false" aria-controls="${panelId}" data-reveal="#${panelId}">Show voluntary disclosures</button>
<div id="${panelId}" hidden style="display:none">
<label for="disclosure-text-${seq}">Voluntary disclosure (${seq})</label>
<textarea id="disclosure-text-${seq}" name="disclosure-text-${seq}" rows="3" maxlength="300"></textarea>
</div>`),
                title: `Disclosure ${seq}`,
                requiresInteraction: true,
                interactionSteps: [{ action: 'click', text: 'show voluntary' }],
            };
        },
    },
    {
        prefix: 'syn-mega-mixed',
        count: 20,
        category: 'mega-mixed',
        build(index, seq) {
            const rng = createRng(seq * 647);
            const contact = contactBlock(seq, rng, 'mix');
            const modalId = `modal-${seq}`;
            const extraId = `modal-loc-${seq}`;
            const parts = [
                contact.html,
                index % 2 === 0 ? visibleListbox(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4)) : hiddenListbox(`${pick(rng, LOCATIONS)} (${seq})`, seq, pickN(rng, LOC_OPTS, 4)),
                `<button type="button" data-reveal="#${modalId}" aria-haspopup="dialog" aria-controls="${modalId}">Add details</button>
<div id="${modalId}" role="dialog" hidden style="display:none">
<label for="${extraId}">${pick(rng, PORTFOLIOS)} (${seq})</label>
<input type="url" id="${extraId}" name="${extraId}">
</div>`,
                fileUploadDecor(seq),
            ];

            const needsInteraction = index % 2 === 1;

            return {
                html: formWrap(`Mixed complex ${seq}`, parts.join('\n')),
                title: `Mixed complex ${seq}`,
                requiresInteraction: true,
                interactionSteps: needsInteraction
                    ? [{ action: 'click', selector: '.custom-dropdown-trigger' }, { action: 'click', text: 'add details' }]
                    : [{ action: 'click', text: 'add details' }],
            };
        },
    },
];

let generated = 0;
let globalSeq = 9000;

for (const batch of BATCHES) {
    for (let i = 0; i < batch.count; i += 1) {
        globalSeq += 1;
        const id = `${batch.prefix}-${String(i + 1).padStart(3, '0')}`;
        const result = batch.build(i, globalSeq);
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
console.log(`Generated ${generated} mega form scenarios in ${HTML_DIR}`);
console.log(`Categories:\n  ${batchSummary}`);
console.log(`Manifest: ${MANIFEST_PATH} (${manifest.scenarios.length} total scenarios)`);
