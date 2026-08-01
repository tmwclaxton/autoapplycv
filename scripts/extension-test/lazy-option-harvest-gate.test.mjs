#!/usr/bin/env node
/**
 * Regression: background inventory must not open combobox dropdowns when the
 * extension is idle (sidebar closed, no Draft All / Auto Apply).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FORM_HEURISTICS_PATH = join(ROOT, 'extension/src/content/form-heuristics.js');
const FIELD_INVENTORY_PATH = join(ROOT, 'extension/src/content/field-inventory.js');
const BACKGROUND_PATH = join(ROOT, 'extension/src/background/index.js');
const CONTENT_PATH = join(ROOT, 'extension/src/content/index.js');
const FORM_FRAME_MESSAGING_PATH = join(ROOT, 'extension/src/shared/form-frame-messaging.js');

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button, [role="combobox"]').forEach((el) => {
        el.style.display = el.style.display || 'block';
        el.style.visibility = 'visible';
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() { return this.parentElement || document.body; },
        });
        Object.defineProperty(el, 'offsetWidth', { configurable: true, get() { return 120; } });
        Object.defineProperty(el, 'offsetHeight', { configurable: true, get() { return 24; } });
    });
})();
`;

function buildLazyComboboxHtml() {
    return `<!doctype html>
<html>
<body>
  <form id="application_form">
    <label for="source">How did you hear about this job?</label>
    <div class="select__control">
      <input
        id="source"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="source-listbox"
        type="text"
        value=""
      />
      <button type="button" aria-label="Toggle flyout">Toggle</button>
    </div>
    <div id="source-listbox" role="listbox" hidden></div>
  </form>
</body>
</html>`;
}

function loadInventoryWindow(html, pageUrl) {
    const dom = new JSDOM(html, {
        url: pageUrl,
        contentType: 'text/html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();
    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8');

    vm.runInContext(VISIBILITY_PATCH, context);
    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);

    const combobox = window.document.getElementById('source');
    const listbox = window.document.getElementById('source-listbox');
    const toggle = window.document.querySelector('button[aria-label="Toggle flyout"]');

    toggle?.addEventListener('click', () => {
        combobox.setAttribute('aria-expanded', 'true');
        listbox.hidden = false;
        listbox.innerHTML = `
            <div role="option">LinkedIn</div>
            <div role="option">Referral</div>
        `;
    });

    return window;
}

test('wiring passes allowInteractiveOptionHarvest through snapshot collection', () => {
    const backgroundJs = readFileSync(BACKGROUND_PATH, 'utf8');
    const contentJs = readFileSync(CONTENT_PATH, 'utf8');
    const messagingJs = readFileSync(FORM_FRAME_MESSAGING_PATH, 'utf8');
    const inventoryJs = readFileSync(FIELD_INVENTORY_PATH, 'utf8');

    assert.match(backgroundJs, /shouldAllowInteractiveOptionHarvest/);
    assert.match(backgroundJs, /collectSnapshotFromTabWithHarvestPolicy/);
    assert.match(backgroundJs, /allowInteractiveOptionHarvest/);
    assert.match(messagingJs, /allowInteractiveOptionHarvest: options\.allowInteractiveOptionHarvest === true/);
    assert.match(contentJs, /allowInteractiveOptionHarvest: message\.allowInteractiveOptionHarvest === true/);
    assert.match(inventoryJs, /allowInteractiveOptionHarvest !== true/);
    assert.match(inventoryJs, /Skipped lazy combobox option harvest \(inactive\)/);
});

test('buildSnapshotAllFramesAsync does not open comboboxes when harvest is disallowed', async () => {
    const window = loadInventoryWindow(
        buildLazyComboboxHtml(),
        'https://boards.greenhouse.io/example/jobs/123#app',
    );
    const combobox = window.document.getElementById('source');
    const listbox = window.document.getElementById('source-listbox');
    let harvestCalls = 0;
    const originalHarvest = window.AutoCVApplyFormHeuristics.harvestLazyComboboxOptionLabels
        .bind(window.AutoCVApplyFormHeuristics);

    window.AutoCVApplyFormHeuristics.harvestLazyComboboxOptionLabels = async (...args) => {
        harvestCalls += 1;

        return originalHarvest(...args);
    };

    await window.AutoCVApplyFieldInventory.buildSnapshotAllFramesAsync(
        window.document,
        {},
        {},
        {},
        { allowInteractiveOptionHarvest: false },
    );

    assert.equal(harvestCalls, 0, 'lazy harvest must not run while inactive');
    assert.equal(combobox.getAttribute('aria-expanded'), 'false');
    assert.equal(listbox.hidden, true);
});

test('buildSnapshotAllFramesAsync may harvest combobox options when allowed', async () => {
    const window = loadInventoryWindow(
        buildLazyComboboxHtml(),
        'https://boards.greenhouse.io/example/jobs/123#app',
    );
    let harvestCalls = 0;
    const originalHarvest = window.AutoCVApplyFormHeuristics.harvestLazyComboboxOptionLabels
        .bind(window.AutoCVApplyFormHeuristics);

    window.AutoCVApplyFormHeuristics.harvestLazyComboboxOptionLabels = async (...args) => {
        harvestCalls += 1;

        return originalHarvest(...args);
    };

    const snapshot = await window.AutoCVApplyFieldInventory.buildSnapshotAllFramesAsync(
        window.document,
        {},
        {},
        {},
        { allowInteractiveOptionHarvest: true },
    );
    const selectField = (snapshot.elements || []).find((element) => element.field_type === 'select');

    assert.ok(selectField, 'expected a select combobox in inventory');
    assert.ok(harvestCalls >= 1, 'lazy harvest should run when allowed');
});
