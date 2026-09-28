#!/usr/bin/env node
/**
 * LinkedIn 2026 SDUI Easy Apply modals drop `.jobs-easy-apply-*` classes and
 * often say "Apply to …" instead of "Easy Apply". Detection must still find
 * the dialog (including open shadow roots) so Draft All inventories it.
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
const LINKEDIN_PARSER_SCRIPT = join(
    ROOT,
    'extension/src/content/linkedin-parser.js',
);
const LINKEDIN_AUTO_APPLY_SCRIPT = join(
    ROOT,
    'extension/src/content/linkedin-auto-apply.js',
);

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button, [role="dialog"], .artdeco-modal, dialog').forEach((el) => {
        el.style.display = el.style.display || 'block';
        el.style.visibility = 'visible';
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() { return this.parentElement || document.body; },
        });
        Object.defineProperty(el, 'offsetWidth', { configurable: true, get() { return 400; } });
        Object.defineProperty(el, 'offsetHeight', { configurable: true, get() { return 300; } });
        Object.defineProperty(el, 'getBoundingClientRect', {
            configurable: true,
            value() { return { width: 400, height: 300, top: 40, left: 40, right: 440, bottom: 340 }; },
        });
    });
})();
`;

function loadLinkedInWindow(html, pageUrl) {
    const dom = new JSDOM(html, {
        url: pageUrl,
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
    const parser = readFileSync(LINKEDIN_PARSER_SCRIPT, 'utf8');
    const autoApply = readFileSync(LINKEDIN_AUTO_APPLY_SCRIPT, 'utf8');

    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);
    vm.runInContext(parser, context);
    vm.runInContext(autoApply, context);
    vm.runInContext(VISIBILITY_PATCH, context);

    return window;
}

test('SDUI Apply-to dialog without jobs-easy-apply classes is detected', () => {
    const html = `<!doctype html><html><body>
  <div class="jobs-details"><h1>AI Engineer</h1><button>Easy Apply</button></div>
  <div role="dialog" aria-modal="true" class="artdeco-modal" style="display:block;position:fixed;inset:40px;">
    <h2 id="jobs-apply-header">Apply to ISL Talent</h2>
    <div class="artdeco-modal__content">
      <h3>Contact info</h3>
      <label>Email <input type="email" name="email" value="toby@example.com"></label>
      <label>Phone <input type="tel" name="phone" value="+447700900123"></label>
    </div>
    <div class="artdeco-modal__actionbar">
      <button type="button" class="artdeco-button artdeco-button--primary" aria-label="Continue to next step">Next</button>
    </div>
  </div>
</body></html>`;
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4469769337/',
    );
    const modal = window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal();

    assert.ok(modal, 'expected SDUI Apply-to dialog to be detected');
    assert.match(String(modal.textContent || ''), /Apply to ISL Talent/i);

    const state = window.AutoCVApplyLinkedInAutoApply.getEasyApplyModalState();
    assert.equal(state.open, true);

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { email: 'toby@example.com', phone: '+447700900123' } },
        {},
        {},
    );

    assert.ok(
        (snapshot.elements || []).length >= 2,
        `expected contact fields inventoried inside modal, got ${JSON.stringify(
            (snapshot.elements || []).map((el) => el.question),
        )}`,
    );
    assert.equal(
        window.AutoCVApplyFieldInventory.resolveHighlightRoot(),
        modal,
        'highlight/inventory root must be the Easy Apply modal, not job detail',
    );
});

test('SDUI Easy Apply modal inside open shadow root is detected', () => {
    const html = `<!doctype html><html><body>
  <div class="jobs-details"><h1>Engineer</h1></div>
  <div id="sdui-apply-host"></div>
</body></html>`;
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4470468597/',
    );
    const host = window.document.getElementById('sdui-apply-host');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div role="dialog" aria-modal="true" class="artdeco-modal" style="display:block;width:500px;height:400px;">
        <h2>Apply to Totum Partners</h2>
        <div>
          <h3>Contact info</h3>
          <label>Email <input type="email" id="shadow-email"></label>
          <label>Mobile phone number <input type="tel" id="shadow-phone"></label>
        </div>
        <footer>
          <button type="button" class="artdeco-button--primary" aria-label="Continue to next step">Next</button>
        </footer>
      </div>
    `;

    // Re-apply visibility helpers for shadow nodes.
    for (const el of shadow.querySelectorAll(
        'input, button, [role="dialog"], .artdeco-modal',
    )) {
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() {
                return this.parentElement || host;
            },
        });
        Object.defineProperty(el, 'offsetWidth', {
            configurable: true,
            get() {
                return 400;
            },
        });
        Object.defineProperty(el, 'offsetHeight', {
            configurable: true,
            get() {
                return 300;
            },
        });
        Object.defineProperty(el, 'getBoundingClientRect', {
            configurable: true,
            value() {
                return {
                    width: 400,
                    height: 300,
                    top: 40,
                    left: 40,
                    right: 440,
                    bottom: 340,
                };
            },
        });
    }

    const modal = window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal();
    assert.ok(modal, 'expected shadow SDUI Easy Apply modal');
    assert.equal(
        window.AutoCVApplyLinkedInAutoApply.getEasyApplyModalState().open,
        true,
    );

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { email: 'a@b.com' } },
        {},
        {},
    );
    const questions = (snapshot.elements || []).map((el) =>
        String(el.question || '').toLowerCase(),
    );

    assert.ok(
        questions.some((q) => q.includes('email') || q.includes('phone')),
        `expected shadow contact fields, got ${JSON.stringify(questions)}`,
    );
});

test('legacy jobs-easy-apply-modal still detected', () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/auto-apply/linkedin-easy-apply-modal.html'),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/123/',
    );
    const modal = window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal();

    assert.ok(modal);
    assert.match(String(modal.className || ''), /jobs-easy-apply-modal/);
});

test('background empty Easy Apply step messaging is LinkedIn-aware', () => {
    const source = readFileSync(
        join(ROOT, 'extension/src/background/index.js'),
        'utf8',
    );

    assert.match(source, /Easy Apply is open, but there are no unanswered questions/);
    assert.match(source, /Click Next to continue/);
    assert.match(source, /form has not finished loading/);
    assert.match(
        readFileSync(LINKEDIN_AUTO_APPLY_SCRIPT, 'utf8'),
        /looksLikeEasyApplyModal/,
    );
    assert.match(
        readFileSync(LINKEDIN_AUTO_APPLY_SCRIPT, 'utf8'),
        /collectDocumentsForEasyApplyModalSearch/,
    );
    assert.match(
        readFileSync(LINKEDIN_AUTO_APPLY_SCRIPT, 'utf8'),
        /querySelectorAllDeepLocal/,
    );
});
