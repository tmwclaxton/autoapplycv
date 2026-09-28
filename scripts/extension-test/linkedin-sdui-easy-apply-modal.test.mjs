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
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';

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

    assert.match(
        source,
        /Easy Apply is open, but there are no unanswered questions/,
    );
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

const UK_PROFILE = {
    country: 'United Kingdom',
    email: 'toby@example.com',
    phone: '+447700900123',
    first_name: 'Toby',
    last_name: 'Claxton',
    skills: ['Python', 'React', 'Node.js', 'TypeScript'],
    experience: [
        {
            company: 'Acme',
            title: 'Software Engineer',
            start_date: '2020-01',
            end_date: 'Present',
            technologies: ['Python', 'React', 'Node.js'],
        },
    ],
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
        years_of_experience: '4',
        affirm_local_hybrid: 'yes',
    },
};

test('SDUI Additional Questions modal inventories years + Yes/No radios', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-additional-questions.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4462990314/',
    );

    const modal = window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal();
    assert.ok(modal, 'SDUI Additional Questions dialog must be detected');
    assert.match(String(modal.textContent || ''), /Additional Questions/i);
    assert.equal(
        window.AutoCVApplyLinkedInAutoApply.getEasyApplyModalState().open,
        true,
    );
    assert.equal(
        window.AutoCVApplyFieldInventory.resolveHighlightRoot(),
        modal,
        'inventory root must be the Apply dialog, not job detail',
    );

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: UK_PROFILE },
        {},
        {},
    );
    const questions = (snapshot.elements || []).map((el) =>
        String(el.question || ''),
    );

    assert.ok(
        questions.some((q) => /years.*Python/i.test(q)),
        `expected Python years field, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /years.*React/i.test(q)),
        `expected React years field, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /sponsorship/i.test(q)),
        `expected sponsorship radio, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /commuting/i.test(q)),
        `expected commute radio, got ${JSON.stringify(questions)}`,
    );

    const years = (snapshot.elements || []).filter((el) =>
        /years of work experience/i.test(el.question || ''),
    );
    assert.ok(
        years.length >= 3,
        `expected at least 3 skill-years inputs, got ${years.length}`,
    );
    for (const field of years) {
        assert.ok(
            ['text', 'number', 'tel'].includes(String(field.field_type || '')),
            `years field type unexpected: ${field.field_type}`,
        );
    }

    const sponsorship = (snapshot.elements || []).find((el) =>
        /sponsorship/i.test(el.question || ''),
    );
    assert.equal(sponsorship?.field_type, 'radio');
    assert.ok(
        (sponsorship?.options || []).some((opt) => /^yes$/i.test(String(opt))),
    );
    assert.ok(
        (sponsorship?.options || []).some((opt) => /^no$/i.test(String(opt))),
    );
});

test('SDUI Additional Questions draft plan maps sponsorship No; skill years pending', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-additional-questions.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4468548584/',
    );
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: UK_PROFILE },
        {},
        {},
    );

    const fields = (snapshot.elements || []).map((el, index) => ({
        id: index,
        ref: el.ref || `f${index}`,
        label: el.question,
        field_type: el.field_type,
        options: el.options,
        required: el.required !== false,
    }));

    assert.ok(
        fields.length >= 4,
        `expected Additional Questions fields for Draft All, got ${fields.length}`,
    );

    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: UK_PROFILE,
        questionMemo: {},
        pageUrl: 'https://www.linkedin.com/jobs/view/4468548584/',
    });

    const staged = (plan.applyStages || []).flatMap(
        (stage) => stage.answers || [],
    );
    const sponsorshipAnswer = staged.find((row) =>
        /sponsorship/i.test(fields.find((f) => f.ref === row.ref)?.label || ''),
    );
    assert.ok(sponsorshipAnswer, 'sponsorship must be answered from profile');
    assert.match(String(sponsorshipAnswer.answer), /^no$/i);

    const pythonRef = fields.find((f) => /years.*Python/i.test(f.label))?.ref;
    assert.ok(pythonRef);
    const pythonStaged = staged.find((row) => row.ref === pythonRef);
    if (pythonStaged) {
        assert.equal(
            String(pythonStaged.answer),
            '__CLEAR__',
            'skill-years must not dump total YOE',
        );
    }
    assert.ok(
        (plan.pendingFields || []).some((row) => row.ref === pythonRef) ||
            pythonStaged?.answer === '__CLEAR__',
        'Python skill-years should clear/pending for honest fill',
    );
});
