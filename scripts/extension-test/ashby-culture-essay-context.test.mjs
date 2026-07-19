#!/usr/bin/env node
/**
 * Ashby culture-values helper text (Connect / Challenge / Own) must land in
 * field inventory context so NanoGPT can draft the essay.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FORM_HEURISTICS_PATH = join(
    ROOT,
    'extension/src/content/form-heuristics.js',
);
const FIELD_INVENTORY_PATH = join(
    ROOT,
    'extension/src/content/field-inventory.js',
);

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button').forEach((el) => {
        el.style.display = el.style.display || 'block';
        el.style.visibility = 'visible';
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() { return this.parentElement || document.body; },
        });
        Object.defineProperty(el, 'offsetWidth', { configurable: true, get() { return 100; } });
        Object.defineProperty(el, 'offsetHeight', { configurable: true, get() { return 20; } });
    });
})();
`;

const ASHBY_CULTURE_HTML = `<!doctype html>
<html>
<body>
  <div class="ashby-application-form-section-container">
    <h2 class="ashby-application-form-section-header-title">Skills and Experience Details</h2>
    <div class="ashby-application-form-field-entry" data-field-path="culture-values">
      <label class="ashby-application-form-question-title" for="culture">
        Please give an example from your professional experience that aligns with one or more of our cultural values:
      </label>
      <div class="ashby-application-form-question-description">
        <p>Writer's values of Connect, Challenge, Own can be reviewed here</p>
      </div>
      <textarea id="culture" name="culture" required rows="4"></textarea>
    </div>
  </div>
</body>
</html>`;

function loadInventoryWindow(html) {
    const dom = new JSDOM(html, {
        url: 'https://jobs.ashbyhq.com/WRITER/apply',
        contentType: 'text/html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();

    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8').replace(
        'const AutoCVApplyFieldInventory =',
        'globalThis.AutoCVApplyFieldInventory =',
    );

    vm.runInContext(VISIBILITY_PATCH, context);
    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);

    return window;
}

test('Ashby culture-values description is included in inventory context', () => {
    const window = loadInventoryWindow(ASHBY_CULTURE_HTML);
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { full_name: 'Test User', email: 'test@example.com' } },
        {},
        {},
    );

    const culture = (snapshot.elements || []).find((field) =>
        /cultural values/i.test(field.question || ''),
    );

    assert.ok(culture, 'culture textarea should be inventoried');
    assert.match(
        String(culture.context || ''),
        /Connect,\s*Challenge,\s*Own/i,
        `expected Connect/Challenge/Own in context, got: ${culture.context}`,
    );
});
