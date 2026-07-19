#!/usr/bin/env node
/**
 * Ripple-style Greenhouse embeds (#grnhse_iframe) often report offsetParent=null
 * for text inputs while labeled file inputs still inventory via the file bypass.
 * Draft All must still see First Name / Email / etc.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadHeuristics(dom, { collapseLayout = false } = {}) {
    const script = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        Element: context.Element,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLTextAreaElement: context.HTMLTextAreaElement,
        HTMLSelectElement: context.HTMLSelectElement,
        ShadowRoot: context.ShadowRoot,
        CSS: context.CSS,
        Event: context.Event,
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

    for (const element of context.document.querySelectorAll(
        'input, select, textarea, [role="combobox"]',
    )) {
        Object.defineProperty(element, 'offsetParent', {
            configurable: true,
            get() {
                if (collapseLayout && element.type !== 'file') {
                    return null;
                }

                return element.parentElement || context.document.body;
            },
        });

        if (collapseLayout && element.type !== 'file') {
            element.getClientRects = () => [];
        }
    }

    return context.AutoCVApplyFormHeuristics;
}

function buildEmbedFixture() {
    return new JSDOM(
        `<!doctype html>
<html>
  <body>
    <form id="application-form" class="application--form">
      <div class="field-wrapper">
        <label for="first_name">First Name</label>
        <input id="first_name" class="input input__single-line" type="text" aria-label="First Name" />
      </div>
      <div class="field-wrapper">
        <label for="last_name">Last Name</label>
        <input id="last_name" class="input input__single-line" type="text" aria-label="Last Name" />
      </div>
      <div class="field-wrapper">
        <label for="email">Email</label>
        <input id="email" class="input input__single-line" type="text" aria-label="Email" />
      </div>
      <div class="field-wrapper">
        <label for="phone">Phone</label>
        <input id="phone" class="input input__single-line" type="tel" aria-label="Phone" />
      </div>
      <div class="field-wrapper">
        <label class="upload-label" id="upload-label-resume" for="resume">Resume/CV</label>
        <input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc" />
      </div>
      <div class="field-wrapper">
        <label class="upload-label" id="upload-label-cover_letter" for="cover_letter">Cover Letter</label>
        <input id="cover_letter" class="visually-hidden" type="file" accept=".pdf,.doc" />
      </div>
    </form>
  </body>
</html>`,
        {
            url: 'https://job-boards.greenhouse.io/embed/job_app?for=ripple&token=8010492',
        },
    );
}

test('Greenhouse embed inventories text fields when layout is clipped', () => {
    const dom = buildEmbedFixture();
    const heuristics = loadHeuristics(dom, { collapseLayout: true });
    const labels = [];

    heuristics.eachDraftableField(
        dom.window.document,
        {},
        {},
        {},
        (field) => {
            labels.push(field.label);
        },
        { includeFilled: true },
    );

    assert.ok(
        labels.some((label) => /first name/i.test(label)),
        `expected First Name, got: ${labels.join(' | ')}`,
    );
    assert.ok(
        labels.some((label) => /email/i.test(label)),
        `expected Email, got: ${labels.join(' | ')}`,
    );
    assert.ok(
        labels.some((label) => /resume|cv/i.test(label)),
        `expected Resume/CV, got: ${labels.join(' | ')}`,
    );
    assert.ok(
        labels.length >= 5,
        `expected >=5 draftable fields, got ${labels.length}: ${labels.join(' | ')}`,
    );
});

test('Greenhouse embed countDraftableFields includes clipped text fields', () => {
    const dom = buildEmbedFixture();
    const heuristics = loadHeuristics(dom, { collapseLayout: true });
    const count = heuristics.countDraftableFields(
        dom.window.document,
        {},
        {},
        {},
    );

    assert.ok(
        count >= 5,
        `expected count >= 5 for clipped embed, got ${count}`,
    );
});
