#!/usr/bin/env node
/**
 * Generate interactive/custom-component synthetic fixtures (syn-ix-*).
 * Covers click-to-reveal patterns and ARIA custom controls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();

const names = ['Full name', 'Legal name', 'Applicant name', 'Your name'];
const emails = ['Email address', 'Work email', 'Contact email', 'Personal email'];
const phones = ['Phone number', 'Mobile number', 'Contact number', 'Telephone'];
const locations = ['Preferred location', 'Work location', 'Office preference', 'Where are you based?'];
const skills = ['Key skills', 'Technical skills', 'Primary expertise', 'Core competencies'];
const startDates = ['Earliest start date', 'Available from', 'Start date preference', 'When can you start?'];

function pick(list, index) {
    return list[index % list.length];
}

function shell(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<main><h1>${title}</h1>${body}</main>
</body>
</html>`;
}

function formOpen(attrs = 'action="/apply" method="post"') {
    return `<form ${attrs}>`;
}

function formClose() {
    return '</form>';
}

function contactFields(index) {
    const name = pick(names, index);
    const email = pick(emails, index);
    const phone = pick(phones, index);
    const nameId = slugify(`ix-name-${index}`).slice(0, 20);
    const emailId = slugify(`ix-email-${index}`).slice(0, 20);
    const phoneId = slugify(`ix-phone-${index}`).slice(0, 20);

    return `
<label for="${nameId}">${name}</label>
<input type="text" id="${nameId}" name="${nameId}">
<label for="${emailId}">${email}</label>
<input type="email" id="${emailId}" name="${emailId}">
<label for="${phoneId}">${phone}</label>
<input type="tel" id="${phoneId}" name="${phoneId}">`;
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
        notes: options.notes || '',
        requires_interaction: options.requiresInteraction ?? false,
        interaction_steps: options.interactionSteps || [],
    });
}

function visibleListboxDropdown(index) {
    const label = pick(locations, index);
    const listId = `listbox-${index}`;

    return `
<div class="field-row">
<span id="${listId}-lbl">${label}</span>
<div role="combobox" aria-expanded="true" aria-controls="${listId}" aria-labelledby="${listId}-lbl" tabindex="0">${label}</div>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl">
<div role="option" data-value="london">London</div>
<div role="option" data-value="remote">Remote</div>
<div role="option" data-value="hybrid">Hybrid</div>
<div role="option" data-value="manchester">Manchester</div>
</div>
</div>`;
}

function collapsedListboxDropdown(index, triggerClass = 'custom-dropdown-trigger') {
    const label = pick(locations, index);
    const listId = `listbox-hidden-${index}`;

    return `
<div class="field-row">
<span id="${listId}-lbl">${label}</span>
<button type="button" class="${triggerClass}" role="combobox" aria-expanded="false" aria-controls="${listId}" aria-labelledby="${listId}-lbl" data-reveal="#${listId}">Select ${label.toLowerCase()}</button>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
<div role="option" data-value="london">London</div>
<div role="option" data-value="remote">Remote</div>
<div role="option" data-value="hybrid">Hybrid</div>
<div role="option" data-value="berlin">Berlin</div>
</div>
</div>`;
}

function visibleRoleCheckboxGroup(index) {
    const label = pick(skills, index);
    const groupId = `skills-group-${index}`;

    return `
<div role="group" id="${groupId}" aria-labelledby="${groupId}-lbl">
<span id="${groupId}-lbl">${label}</span>
<div role="checkbox" aria-checked="false" tabindex="0">JavaScript</div>
<div role="checkbox" aria-checked="false" tabindex="-1">TypeScript</div>
<div role="checkbox" aria-checked="false" tabindex="-1">Python</div>
<div role="checkbox" aria-checked="false" tabindex="-1">Go</div>
</div>`;
}

function hiddenRoleCheckboxGroup(index) {
    const label = pick(skills, index);
    const panelId = `skills-panel-${index}`;
    const groupId = `skills-group-hidden-${index}`;

    return `
<button type="button" id="show-skills-${index}" data-reveal="#${panelId}" aria-expanded="false">Show skill options</button>
<div id="${panelId}" hidden style="display:none">
<div role="group" id="${groupId}" aria-labelledby="${groupId}-lbl">
<span id="${groupId}-lbl">${label}</span>
<div role="checkbox" aria-checked="false">React</div>
<div role="checkbox" aria-checked="false">Vue</div>
<div role="checkbox" aria-checked="false">Svelte</div>
<div role="checkbox" aria-checked="false">Angular</div>
</div>
</div>`;
}

function hiddenDatePicker(index) {
    const label = pick(startDates, index);
    const panelId = `date-panel-${index}`;
    const inputId = `date-input-${index}`;

    return `
<label for="date-trigger-${index}">${label}</label>
<button type="button" id="date-trigger-${index}" aria-haspopup="dialog" aria-controls="${panelId}" data-reveal="#${panelId}">Choose date</button>
<div id="${panelId}" role="dialog" hidden style="display:none" aria-label="${label}">
<label for="${inputId}">${label}</label>
<input type="date" id="${inputId}" name="${inputId}">
</div>`;
}

function hiddenModalFields(index) {
    const label = pick(locations, index);
    const modalId = `modal-${index}`;
    const extraId = `modal-location-${index}`;

    return `
<button type="button" data-open-modal="" aria-haspopup="dialog" aria-controls="${modalId}" data-reveal="#${modalId}">Add details</button>
<div id="${modalId}" role="dialog" hidden style="display:none" aria-label="Additional details">
<label for="${extraId}">${label}</label>
<input type="text" id="${extraId}" name="${extraId}">
<label for="modal-notes-${index}">Additional notes</label>
<textarea id="modal-notes-${index}" name="modal-notes-${index}" rows="3" maxlength="300"></textarea>
</div>`;
}

function hiddenRevealSection(index) {
    const coverId = `cover-${index}`;

    return `
<button type="button" id="show-more-${index}" data-reveal="#extra-${index}">Show more questions</button>
<div id="extra-${index}" hidden style="display:none">
<label for="${coverId}">Why do you want this role?</label>
<textarea id="${coverId}" name="${coverId}" rows="4" maxlength="500"></textarea>
<label for="referral-${index}">Referral source</label>
<input type="text" id="referral-${index}" name="referral-${index}">
</div>`;
}

function hiddenAddAnswer(index) {
    const answerId = `answer-${index}`;

    return `
<button type="button" id="add-answer-${index}" data-reveal="#answer-panel-${index}">Add answer</button>
<div id="answer-panel-${index}" hidden style="display:none">
<label for="${answerId}">Tell us about a recent project</label>
<textarea id="${answerId}" name="${answerId}" rows="5" maxlength="600"></textarea>
</div>`;
}

function vueCombobox(index) {
    const label = pick(locations, index);
    const listId = `vue-listbox-${index}`;

    return `
<div id="app" data-v-app>
<div class="v-select">
<span id="${listId}-lbl">${label}</span>
<button type="button" class="custom-dropdown-trigger" role="combobox" aria-expanded="false" aria-controls="${listId}" aria-labelledby="${listId}-lbl" data-reveal="#${listId}">${label}</button>
<ul role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
<li role="option">London</li>
<li role="option">Remote</li>
<li role="option">Hybrid</li>
</ul>
</div>
</div>`;
}

function reactCombobox(index) {
    const label = pick(locations, index);
    const listId = `react-listbox-${index}`;

    return `
<div data-reactroot class="ApplicationForm">
<div class="MuiAutocomplete-root">
<label id="${listId}-lbl">${label}</label>
<div role="combobox" aria-expanded="false" aria-controls="${listId}" aria-labelledby="${listId}-lbl" class="custom-dropdown-trigger" tabindex="0" data-reveal="#${listId}">${label}</div>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
<div role="option">Office</div>
<div role="option">Remote</div>
<div role="option">Hybrid</div>
</div>
</div>
</div>`;
}

function svelteChipPanel(index) {
    const label = pick(skills, index);
    const panelId = `svelte-chips-${index}`;
    const groupId = `svelte-group-${index}`;

    return `
<div class="svelte-app">
<button type="button" data-reveal="#${panelId}">Select skills</button>
<div id="${panelId}" hidden style="display:none">
<div role="group" aria-labelledby="${groupId}-lbl" id="${groupId}">
<span id="${groupId}-lbl">${label}</span>
<span role="checkbox" aria-checked="false">Design systems</span>
<span role="checkbox" aria-checked="false">Accessibility</span>
<span role="checkbox" aria-checked="false">Performance</span>
</div>
</div>
</div>`;
}

function openShadowForm(index) {
    const name = pick(names, index);
    const email = pick(emails, index);

    return `
<apply-form-element id="shadow-host-${index}"></apply-form-element>
<script>
(function () {
  class ApplyFormElement extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.innerHTML = \`
        <style>:host { display:block; }</style>
        <form>
          <label for="shadow-name">${name}</label>
          <input type="text" id="shadow-name" name="shadow-name">
          <label for="shadow-email">${email}</label>
          <input type="email" id="shadow-email" name="shadow-email">
        </form>
      \`;
    }
  }
  if (!customElements.get('apply-form-element')) {
    customElements.define('apply-form-element', ApplyFormElement);
  }
})();
</script>
<p data-limitation="closed-shadow-not-supported">Open shadow DOM supplies fields inside custom element; closed shadow roots are not traversed.</p>`;
}

const scenarios = [
    {
        id: 'syn-ix-dropdown-001',
        category: 'interactive-dropdown',
        title: 'Interactive dropdown — visible listbox',
        build: (i) => shell('Visible custom dropdown', `${formOpen()}${contactFields(i)}${visibleListboxDropdown(i)}${formClose()}`),
        notes: 'Custom listbox options visible without click; should extract as select.',
    },
    {
        id: 'syn-ix-dropdown-002',
        category: 'interactive-dropdown',
        title: 'Interactive dropdown — visible React-style',
        build: (i) => shell('React dropdown visible', `${formOpen()}${contactFields(i)}${reactCombobox(i).replace('hidden style="display:none"', '').replace(' aria-expanded="false"', ' aria-expanded="true"')}${formClose()}`),
        notes: 'Expanded combobox with visible listbox.',
    },
    {
        id: 'syn-ix-dropdown-003',
        category: 'interactive-dropdown',
        title: 'Interactive dropdown — click to expand',
        build: (i) => shell('Collapsed custom dropdown', `${formOpen()}${contactFields(i)}${collapsedListboxDropdown(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '.custom-dropdown-trigger' }],
        notes: 'Listbox hidden until combobox click.',
    },
    {
        id: 'syn-ix-dropdown-004',
        category: 'interactive-dropdown',
        title: 'Interactive dropdown — Vue select click',
        build: (i) => shell('Vue collapsed dropdown', `${formOpen()}${contactFields(i)}${vueCombobox(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '.custom-dropdown-trigger' }],
    },
    {
        id: 'syn-ix-dropdown-005',
        category: 'interactive-dropdown',
        title: 'Interactive dropdown — text trigger click',
        build: (i) => shell('Dropdown text trigger', `${formOpen()}${contactFields(i)}${collapsedListboxDropdown(i, 'location-trigger')}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'select' }],
    },
    {
        id: 'syn-ix-combobox-001',
        category: 'interactive-combobox',
        title: 'Combobox — aria-expanded click',
        build: (i) => shell('Combobox expand', `${formOpen()}${contactFields(i)}${collapsedListboxDropdown(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '[role="combobox"]' }],
    },
    {
        id: 'syn-ix-combobox-002',
        category: 'interactive-combobox',
        title: 'Combobox — React MUI pattern',
        build: (i) => shell('React combobox', `${formOpen()}${contactFields(i)}${reactCombobox(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '[role="combobox"]' }],
    },
    {
        id: 'syn-ix-combobox-003',
        category: 'interactive-combobox',
        title: 'Combobox — Vue v-select pattern',
        build: (i) => shell('Vue combobox', `${formOpen()}${contactFields(i)}${vueCombobox(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '[role="combobox"]' }],
    },
    {
        id: 'syn-ix-combobox-004',
        category: 'interactive-combobox',
        title: 'Combobox — listbox aria-controls',
        build: (i) => {
            const label = pick(locations, i);
            const listId = `combo-list-${i}`;

            return shell('Combobox controls', `${formOpen()}${contactFields(i)}
<span id="${listId}-lbl">${label}</span>
<button type="button" role="combobox" aria-expanded="false" aria-controls="${listId}" aria-labelledby="${listId}-lbl" data-reveal="#${listId}">Open ${label.toLowerCase()}</button>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
<div role="option">New York</div><div role="option">San Francisco</div><div role="option">Austin</div>
</div>${formClose()}`);
        },
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '[role="combobox"]' }],
    },
    {
        id: 'syn-ix-combobox-005',
        category: 'interactive-combobox',
        title: 'Combobox — haspopup listbox',
        build: (i) => {
            const label = pick(locations, i);
            const listId = `haspopup-list-${i}`;

            return shell('Haspopup combobox', `${formOpen()}${contactFields(i)}
<label id="${listId}-lbl">${label}</label>
<button type="button" aria-haspopup="listbox" aria-controls="${listId}" data-reveal="#${listId}">Choose location</button>
<div role="listbox" id="${listId}" aria-labelledby="${listId}-lbl" hidden style="display:none">
<div role="option">Dublin</div><div role="option">Edinburgh</div><div role="option">Cardiff</div>
</div>${formClose()}`);
        },
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'choose location' }],
    },
    {
        id: 'syn-ix-date-001',
        category: 'interactive-datepicker',
        title: 'Date picker — calendar popover click',
        build: (i) => shell('Date picker popover', `${formOpen()}${contactFields(i)}${hiddenDatePicker(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'choose date' }],
        notes: 'Native date input revealed after calendar button click.',
    },
    {
        id: 'syn-ix-date-002',
        category: 'interactive-datepicker',
        title: 'Date picker — dialog calendar',
        build: (i) => shell('Date dialog', `${formOpen()}${contactFields(i)}${hiddenDatePicker(i + 1)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '[aria-haspopup="dialog"]' }],
    },
    {
        id: 'syn-ix-date-003',
        category: 'interactive-datepicker',
        title: 'Date picker — show availability',
        build: (i) => shell('Availability date', `${formOpen()}${contactFields(i)}
<button type="button" id="avail-btn-${i}" data-reveal="#avail-panel-${i}">Show availability calendar</button>
<div id="avail-panel-${i}" hidden style="display:none">
<label for="avail-date-${i}">${pick(startDates, i)}</label>
<input type="date" id="avail-date-${i}" name="avail-date-${i}">
</div>${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'show availability' }],
    },
    {
        id: 'syn-ix-chips-001',
        category: 'interactive-multiselect',
        title: 'Multi-select chips — visible role checkbox',
        build: (i) => shell('Visible skill chips', `${formOpen()}${contactFields(i)}${visibleRoleCheckboxGroup(i)}${formClose()}`),
        notes: 'Chip-style role=checkbox group visible upfront.',
    },
    {
        id: 'syn-ix-chips-002',
        category: 'interactive-multiselect',
        title: 'Multi-select chips — Svelte panel click',
        build: (i) => shell('Svelte chips panel', `${formOpen()}${contactFields(i)}${svelteChipPanel(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'select skills' }],
    },
    {
        id: 'syn-ix-chips-003',
        category: 'interactive-multiselect',
        title: 'Multi-select — hidden chip group',
        build: (i) => shell('Hidden chips', `${formOpen()}${contactFields(i)}${hiddenRoleCheckboxGroup(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'show skill' }],
    },
    {
        id: 'syn-ix-chips-004',
        category: 'interactive-multiselect',
        title: 'Multi-select — toggle panel',
        build: (i) => shell('Toggle chips', `${formOpen()}${contactFields(i)}
<button type="button" data-reveal="#toggle-panel-${i}">Toggle preferences</button>
<div id="toggle-panel-${i}" hidden style="display:none">
<div role="group" aria-labelledby="pref-lbl-${i}">
<span id="pref-lbl-${i}">Work preferences</span>
<div role="checkbox" aria-checked="false">Flexible hours</div>
<div role="checkbox" aria-checked="false">Travel</div>
<div role="checkbox" aria-checked="false">On-site</div>
</div>
</div>${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'toggle preferences' }],
    },
    {
        id: 'syn-ix-check-001',
        category: 'interactive-role-checkbox',
        title: 'Role checkbox — visible group',
        build: (i) => shell('Role checkbox group', `${formOpen()}${contactFields(i)}${visibleRoleCheckboxGroup(i + 2)}${formClose()}`),
    },
    {
        id: 'syn-ix-check-002',
        category: 'interactive-role-checkbox',
        title: 'Role checkbox — framework group',
        build: (i) => shell('Framework checkboxes', `${formOpen()}${contactFields(i)}
<div role="group" aria-labelledby="fw-lbl-${i}">
<span id="fw-lbl-${i}">Framework experience</span>
<div role="checkbox" aria-checked="false">React</div>
<div role="checkbox" aria-checked="false">Vue</div>
<div role="checkbox" aria-checked="false">Angular</div>
</div>${formClose()}`),
    },
    {
        id: 'syn-ix-check-003',
        category: 'interactive-role-checkbox',
        title: 'Role checkbox — div toggles',
        build: (i) => shell('Div checkbox toggles', `${formOpen()}${contactFields(i)}
<div role="group" aria-label="Language proficiency">
<div role="checkbox" aria-checked="false">English</div>
<div role="checkbox" aria-checked="false">French</div>
<div role="checkbox" aria-checked="false">German</div>
</div>${formClose()}`),
    },
    {
        id: 'syn-ix-modal-001',
        category: 'interactive-modal',
        title: 'Modal portal — add details click',
        build: (i) => shell('Modal add details', `${formOpen()}${contactFields(i)}${hiddenModalFields(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'add details' }],
    },
    {
        id: 'syn-ix-modal-002',
        category: 'interactive-modal',
        title: 'Modal portal — open dialog',
        build: (i) => shell('Dialog modal', `${formOpen()}${contactFields(i)}
<button type="button" aria-haspopup="dialog" aria-controls="dialog-${i}" data-reveal="#dialog-${i}">Open modal</button>
<div id="dialog-${i}" role="dialog" hidden style="display:none">
<label for="dialog-field-${i}">Portfolio URL</label>
<input type="url" id="dialog-field-${i}" name="dialog-field-${i}">
</div>${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'open modal' }],
    },
    {
        id: 'syn-ix-modal-003',
        category: 'interactive-modal',
        title: 'Modal portal — teleported fields',
        build: (i) => shell('Portal modal', `${formOpen()}${contactFields(i)}
<button type="button" data-reveal="#portal-modal-${i}">Add work history</button>
<div id="portal-modal-${i}" role="dialog" hidden style="display:none" aria-label="Work history">
<label for="employer-${i}">Most recent employer</label>
<input type="text" id="employer-${i}" name="employer-${i}">
<label for="role-title-${i}">Job title</label>
<input type="text" id="role-title-${i}" name="role-title-${i}">
</div>${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'add work history' }],
    },
    {
        id: 'syn-ix-reveal-001',
        category: 'interactive-reveal',
        title: 'Reveal section — show more click',
        build: (i) => shell('Show more section', `${formOpen()}${contactFields(i)}${hiddenRevealSection(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'show more' }],
    },
    {
        id: 'syn-ix-reveal-002',
        category: 'interactive-reveal',
        title: 'Reveal section — add answer click',
        build: (i) => shell('Add answer reveal', `${formOpen()}${contactFields(i)}${hiddenAddAnswer(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'add answer' }],
    },
    {
        id: 'syn-ix-reveal-003',
        category: 'interactive-reveal',
        title: 'Reveal section — expand questions',
        build: (i) => shell('Expand questions', `${formOpen()}${contactFields(i)}
<button type="button" data-reveal="#expand-${i}">Expand optional questions</button>
<div id="expand-${i}" hidden style="display:none">
<label for="optional-link-${i}">LinkedIn profile</label>
<input type="url" id="optional-link-${i}" name="optional-link-${i}">
<label for="optional-site-${i}">Personal website</label>
<input type="url" id="optional-site-${i}" name="optional-site-${i}">
</div>${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'expand optional' }],
    },
    {
        id: 'syn-ix-reveal-004',
        category: 'interactive-reveal',
        title: 'Reveal section — disclosure panel',
        build: (i) => shell('Disclosure panel', `${formOpen()}${contactFields(i)}
<button type="button" id="disclosure-${i}" aria-expanded="false" aria-controls="disclosure-panel-${i}" data-reveal="#disclosure-panel-${i}">Show voluntary disclosures</button>
<div id="disclosure-panel-${i}" hidden style="display:none">
<label for="disclosure-text-${i}">Voluntary disclosure</label>
<textarea id="disclosure-text-${i}" name="disclosure-text-${i}" rows="3"></textarea>
</div>${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', text: 'show voluntary' }],
    },
    {
        id: 'syn-ix-fw-001',
        category: 'interactive-framework',
        title: 'Framework interactive — Vue combobox + reveal',
        build: (i) => shell('Vue interactive mix', `${formOpen()}${contactFields(i)}${vueCombobox(i)}${hiddenAddAnswer(i)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [
            { action: 'click', selector: '[role="combobox"]' },
            { action: 'click', text: 'add answer' },
        ],
    },
    {
        id: 'syn-ix-fw-002',
        category: 'interactive-framework',
        title: 'Framework interactive — React modal + listbox',
        build: (i) => shell('React interactive mix', `${formOpen()}${contactFields(i)}${reactCombobox(i)}${hiddenModalFields(i + 1)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [
            { action: 'click', selector: '[role="combobox"]' },
            { action: 'click', text: 'add details' },
        ],
    },
    {
        id: 'syn-ix-fw-003',
        category: 'interactive-framework',
        title: 'Framework interactive — Svelte skills + date',
        build: (i) => shell('Svelte interactive mix', `${formOpen()}${contactFields(i)}${svelteChipPanel(i)}${hiddenDatePicker(i + 2)}${formClose()}`),
        requiresInteraction: true,
        interactionSteps: [
            { action: 'click', text: 'select skills' },
            { action: 'click', text: 'choose date' },
        ],
    },
    {
        id: 'syn-ix-shadow-001',
        category: 'interactive-shadow-dom',
        title: 'Shadow DOM — open mode fields',
        build: (i) => shell('Open shadow form', `${formOpen()}${contactFields(i)}${openShadowForm(i)}${formClose()}`),
        notes: 'Open shadow fields are not traversed by mechanical extractor today; contact fields remain extractable.',
    },
    {
        id: 'syn-ix-shadow-002',
        category: 'interactive-shadow-dom',
        title: 'Shadow DOM — limitation documented',
        build: (i) => shell('Shadow limitation', `${formOpen()}${contactFields(i)}
<custom-field-host data-note="closed shadow not supported"></custom-field-host>
<label for="fallback-${i}">Fallback visible field</label>
<input type="text" id="fallback-${i}" name="fallback-${i}">${formClose()}`),
        notes: 'Documents closed shadow limitation; only light DOM fields extracted.',
    },
];

let generated = 0;

for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    const html = scenario.build(index);
    addScenario(scenario.id, scenario.category, scenario.title, html, {
        notes: scenario.notes || `${scenario.category} interactive fixture`,
        requiresInteraction: scenario.requiresInteraction ?? false,
        interactionSteps: scenario.interactionSteps || [],
    });
    generated += 1;
}

saveManifest(manifest);

console.log(`Generated ${generated} interactive form scenarios in ${HTML_DIR}`);
console.log(`Manifest: ${MANIFEST_PATH} (${manifest.scenarios.length} total scenarios)`);
