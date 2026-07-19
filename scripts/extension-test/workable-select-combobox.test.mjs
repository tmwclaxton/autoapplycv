#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function patchVisibility(context) {
    for (const element of context.document.querySelectorAll('input, select, textarea, [role="combobox"]')) {
        Object.defineProperty(element, 'offsetParent', {
            configurable: true,
            get() {
                return element.parentElement || context.document.body;
            },
        });
    }
}

function loadHeuristics(dom) {
    const script = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        Element: context.Element,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLTextAreaElement: context.HTMLTextAreaElement,
        HTMLSelectElement: context.HTMLSelectElement,
        CSS: context.CSS,
        ShadowRoot: context.ShadowRoot,
        Event: context.Event,
        KeyboardEvent: context.KeyboardEvent,
        InputEvent: context.InputEvent,
        FocusEvent: context.FocusEvent,
        MouseEvent: context.MouseEvent,
        PointerEvent: context.MouseEvent,
        MutationObserver: context.MutationObserver,
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    patchVisibility(context);

    return context.AutoCVApplyFormHeuristics;
}

function buildWorkableSelectFixture() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://apply.workable.com/inatai/j/4AD1565987/apply',
    });
    const { document } = dom.window;

    document.body.innerHTML = `
        <div data-input-type="select" data-open="false" data-error="true">
            <label>
                <div data-role="illustrated-input">
                    <input
                        role="combobox"
                        aria-haspopup="listbox"
                        aria-expanded="false"
                        aria-controls="qa_listbox"
                        id="qa_combobox"
                        type="text"
                        readonly="true"
                        value=""
                    />
                </div>
            </label>
            <input tabindex="-1" aria-hidden="true" name="QA_1223184" value="" />
            <ul id="qa_listbox" role="listbox">
                <li role="option" data-value="linkedin">LinkedIn</li>
                <li role="option" data-value="referral">Employee referral</li>
            </ul>
        </div>
    `;

    return dom;
}

test('Workable select combobox commits hidden value input', async () => {
    const dom = buildWorkableSelectFixture();
    const heuristics = loadHeuristics(dom);
    const combobox = dom.window.document.getElementById('qa_combobox');
    const hidden = dom.window.document.querySelector('input[aria-hidden="true"]');

    assert.ok(combobox, 'expected workable combobox');
    assert.ok(hidden, 'expected hidden value input');

    const filled = await heuristics.setFieldValue(combobox, 'LinkedIn');

    assert.equal(filled, true);
    assert.equal(combobox.value, 'LinkedIn');
    assert.equal(hidden.value, 'linkedin');
});

test('Inatai fixture exposes Workable QA combobox in inventory', () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/html/https-apply-workable-com-inatai-j-4ad1565987-apply.html'),
        'utf8',
    );
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://apply.workable.com/inatai/j/4AD1565987/apply',
    });
    const heuristics = loadHeuristics(dom);
    const combobox = dom.window.document.getElementById('input_QA_1223184_input');

    assert.ok(combobox, 'expected Inatai QA combobox');
    assert.equal(combobox.getAttribute('role'), 'combobox');

    const label = heuristics.getQuestionLabel(combobox);

    assert.match(label, /learn about inatai/i);
});

function buildWorkableOrphanSelectFixture() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://apply.workable.com/booksy-1/j/B23F702280/apply/',
    });
    const { document } = dom.window;

    document.body.innerHTML = `
        <span id="QA_11301624_label"><strong>Please specify your current legal work authorization status.</strong></span>
        <div data-ui="QA_11301624" data-open="false" data-input-type="select" data-error="true">
            <label>
                <div data-role="illustrated-input"></div>
            </label>
            <input name="QA_11301624" required tabindex="-1" aria-hidden="true" value="" />
            <ul id="orphan_listbox" role="listbox" hidden>
                <li role="option" data-value="5938001">I am a Polish citizen</li>
                <li role="option" data-value="5938002">I have a Polish work visa</li>
                <li role="option" data-value="5938003">I require sponsorship</li>
            </ul>
        </div>
    `;

    const root = document.querySelector('[data-input-type="select"]');
    const illustrated = root.querySelector('[data-role="illustrated-input"]');
    const listbox = document.getElementById('orphan_listbox');

    illustrated.addEventListener('click', () => {
        root.setAttribute('data-open', 'true');
        listbox.hidden = false;
    });

    for (const option of listbox.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
            const hidden = root.querySelector('input[aria-hidden="true"]');
            hidden.value = option.getAttribute('data-value') || '';
            root.setAttribute('data-open', 'false');
            root.setAttribute('data-error', 'false');
            listbox.hidden = true;
        });
    }

    return dom;
}

test('Workable orphan illustrated select is inventoriable and fillable', async () => {
    const dom = buildWorkableOrphanSelectFixture();
    const heuristics = loadHeuristics(dom);
    patchVisibility(dom.window);

    const fields = [];
    heuristics.eachDraftableField(
        dom.window.document,
        {},
        {},
        {},
        (field, target) => {
            fields.push({ label: field.label, type: field.field_type, name: target?.name });
        },
        { includeFilled: true },
    );

    const authField = fields.find((field) =>
        /legal work authorization status/i.test(field.label),
    );

    assert.ok(authField, 'expected orphan work-auth select in inventory');
    assert.equal(authField.type, 'select');
    assert.equal(authField.name, 'QA_11301624');

    const hidden = dom.window.document.querySelector('input[name="QA_11301624"]');
    const filled = await heuristics.setFieldValue(hidden, 'I require sponsorship');

    assert.equal(filled, true);
    assert.equal(hidden.value, '5938003');
});
