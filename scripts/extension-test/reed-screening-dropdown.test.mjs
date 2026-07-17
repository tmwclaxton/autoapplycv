#!/usr/bin/env node
/**
 * Reed Easy Apply Yes/No screening steps use a custom dropdown
 * (button[data-qa=dropdown-toggle] + role=menuitem), not radios or <select>.
 * Inventory and applyAnswer must surface and fill them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(
    rootDir,
    'tests/fixtures/form-extraction/html/reed-screening-yes-no-dropdown.html',
);

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

const html = readFileSync(fixturePath, 'utf8');
const dom = new JSDOM(html, {
    url: 'https://www.reed.co.uk/jobs/full-stack-software-engineer/57047638',
});

const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    HTMLElement: context.HTMLElement,
    HTMLInputElement: context.HTMLInputElement,
    HTMLTextAreaElement: context.HTMLTextAreaElement,
    HTMLSelectElement: context.HTMLSelectElement,
    CSS: context.CSS,
    Event: context.Event,
    setTimeout,
    clearTimeout,
    console,
    globalThis: context,
};

context.globalThis = context;
vm.createContext(sandbox);
vm.runInContext(heuristicsScript, sandbox);

const H = context.AutoCVApplyFormHeuristics;
const doc = context.document;

for (const el of doc.querySelectorAll('button, [role="menuitem"], [data-qa="dropdown"]')) {
    Object.defineProperty(el, 'offsetParent', {
        configurable: true,
        get() {
            return el.parentElement || doc.body;
        },
    });
}

assert(
    H.frameHasApplicationForm(doc),
    'Reed screening dropdown step must count as an application form host',
);

const fields = H.collectDraftableFields(doc, {}, {});
assert(fields.length >= 1, `Expected at least one draftable field, got ${fields.length}`);

const license = fields.find((field) => /driving license/i.test(field.label));
assert(license, `Expected driving license field in ${JSON.stringify(fields.map((f) => f.label))}`);
assert(license.field_type === 'select', `Expected select field_type, got ${license.field_type}`);
assert(
    Array.isArray(license.options) && license.options.includes('Yes') && license.options.includes('No'),
    `Expected Yes/No options, got ${JSON.stringify(license.options)}`,
);

const applied = await H.applyAnswerByLabel(doc, license.label, 'Yes');
assert(applied, 'applyAnswerByLabel must select Yes on Reed dropdown');

const toggle = doc.querySelector('[data-qa="dropdown-toggle"]');
const selected = String(toggle?.querySelector('span')?.textContent || toggle?.getAttribute('aria-label') || '')
    .replace(/\s+/g, ' ')
    .trim();
assert(
    /^yes$/i.test(selected),
    `Expected Reed dropdown to show Yes after fill, got "${selected}"`,
);

const remaining = H.collectDraftableFields(doc, {}, {});
assert(
    !remaining.some((field) => /driving license/i.test(field.label)),
    'Filled Reed dropdown must leave inventory (no empty draftables for that label)',
);

console.log('reed-screening-dropdown: ok');
