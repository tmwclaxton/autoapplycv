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
import {
    isJunkMemoAnswer,
    isJunkMemoQuestionLabel,
    matchMemoAnswer,
    partitionFieldsByQuestionMemo,
} from '../../extension/src/shared/draft-all-optimizations.js';

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

test('SDUI Additional Questions draft plan fills skill years + sponsorship No', () => {
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
    assert.ok(
        pythonStaged,
        'Python skill-years must be answered from profile YOE',
    );
    assert.equal(String(pythonStaged.answer), '4');
    assert.ok(
        !(plan.pendingFields || []).some((row) => row.ref === pythonRef),
        'skill-years with profile YOE must not defer to sidebar',
    );
});

test('SDUI HartleyCo-style screening radios map onsite/sponsorship/RTW from profile', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-screening-radios.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4469766154/',
    );

    assert.ok(
        window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal(),
        'HartleyCo SDUI modal must be detected',
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
        required: true,
    }));

    assert.ok(
        fields.length >= 3,
        `expected onsite/sponsorship/RTW radios, got ${JSON.stringify(
            fields.map((f) => f.label),
        )}`,
    );

    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: UK_PROFILE,
        questionMemo: {},
        pageUrl: 'https://www.linkedin.com/jobs/view/4469766154/',
    });
    const staged = Object.fromEntries(
        (plan.applyStages || [])
            .flatMap((stage) => stage.answers || [])
            .map((row) => [
                fields.find((f) => f.ref === row.ref)?.label || row.ref,
                String(row.answer),
            ]),
    );

    const onsiteKey = Object.keys(staged).find((label) =>
        /onsite/i.test(label),
    );
    const sponsorKey = Object.keys(staged).find((label) =>
        /sponsorship/i.test(label),
    );
    const rtwKey = Object.keys(staged).find((label) =>
        /legally authorized|right to work/i.test(label),
    );

    assert.ok(onsiteKey, `onsite answered, got ${JSON.stringify(staged)}`);
    assert.match(staged[onsiteKey], /^yes$/i);
    assert.ok(
        sponsorKey,
        `sponsorship answered, got ${JSON.stringify(staged)}`,
    );
    assert.match(staged[sponsorKey], /^no$/i);
    assert.ok(rtwKey, `RTW answered, got ${JSON.stringify(staged)}`);
    assert.match(staged[rtwKey], /^yes$/i);
    assert.equal((plan.pendingFields || []).length, 0);
});

test('SDUI radio option-label trap uses legend text, not Yes', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-radio-option-label-trap.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4459296956/',
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
        !questions.some((q) => /^yes$/i.test(q.trim())),
        `radio question must not be option label Yes, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /onsite setting/i.test(q)),
        `expected onsite legend, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /sponsorship/i.test(q)),
        `expected sponsorship legend, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /coding test/i.test(q)),
        `expected coding-test legend, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        questions.some((q) => /customers/i.test(q)),
        `expected customer-exposure legend, got ${JSON.stringify(questions)}`,
    );

    const onsite = (snapshot.elements || []).find((el) =>
        /onsite setting/i.test(el.question || ''),
    );
    assert.equal(
        onsite?.required,
        true,
        'onsite must detect required from legend *',
    );
    assert.deepEqual([...(onsite?.options || [])].map(String), ['Yes', 'No']);
});

test('SDUI radio trap draft plan answers onsite/sponsorship/coding/customers; ignores junk memo', async () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-radio-option-label-trap.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4465219319/',
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
        required: el.required,
    }));

    assert.equal(
        matchMemoAnswer({ yes: 'on', Yes: 'on' }, 'yes'),
        null,
        'junk yes→on memo must be ignored',
    );
    assert.equal(isJunkMemoQuestionLabel('yes'), true);
    assert.equal(isJunkMemoAnswer('on'), true);

    const memoPartition = partitionFieldsByQuestionMemo(
        fields,
        {
            yes: 'on',
            'Are you comfortable working in an onsite setting?': 'on',
        },
        UK_PROFILE,
    );
    assert.equal(
        memoPartition.memoAnswers.length,
        0,
        'must not apply junk on memo to radios',
    );

    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: UK_PROFILE,
        questionMemo: { yes: 'on' },
        pageUrl: 'https://www.linkedin.com/jobs/view/4465219319/',
    });
    const staged = (plan.applyStages || []).flatMap(
        (stage) => stage.answers || [],
    );
    const byLabel = Object.fromEntries(
        staged.map((row) => [
            fields.find((f) => f.ref === row.ref)?.label || row.ref,
            String(row.answer),
        ]),
    );

    const onsite = Object.keys(byLabel).find((label) => /onsite/i.test(label));
    const sponsor = Object.keys(byLabel).find((label) =>
        /sponsorship/i.test(label),
    );
    const coding = Object.keys(byLabel).find((label) =>
        /coding test/i.test(label),
    );
    const customers = Object.keys(byLabel).find((label) =>
        /customers/i.test(label),
    );

    assert.ok(onsite, JSON.stringify(byLabel));
    assert.match(byLabel[onsite], /^yes$/i);
    assert.ok(sponsor, JSON.stringify(byLabel));
    assert.match(byLabel[sponsor], /^no$/i);
    assert.ok(coding, JSON.stringify(byLabel));
    assert.match(byLabel[coding], /^yes$/i);
    assert.ok(customers, JSON.stringify(byLabel));
    assert.match(byLabel[customers], /^yes$/i);

    // Apply by visible Yes/No label, not value "on".
    const sponsorField = fields.find((f) => /sponsorship/i.test(f.label));
    assert.ok(sponsorField);
    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        sponsorField.label,
        'No',
    );
    assert.equal(applied, true);
    assert.equal(
        window.document.getElementById('sponsor-no')?.checked,
        true,
        'sponsorship No must be checked after label apply',
    );
    assert.equal(window.document.getElementById('sponsor-yes')?.checked, false);
});

test('SDUI no-fieldset radios inventory one field per group with real titles', async () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-nofieldset-radios.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4471603025/',
    );
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: UK_PROFILE },
        {},
        {},
    );
    const radios = (snapshot.elements || []).filter(
        (el) => el.field_type === 'radio',
    );
    const questions = radios.map((el) => String(el.question || ''));

    assert.equal(
        radios.length,
        3,
        `expected 3 radio groups (not collapsed to one "yes"), got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        !questions.some((q) => /^yes$/i.test(q.trim())),
        `must not inventory option label as question, got ${JSON.stringify(questions)}`,
    );
    assert.ok(questions.some((q) => /legally authorized/i.test(q)));
    assert.ok(questions.some((q) => /hybrid setting/i.test(q)));
    assert.ok(questions.some((q) => /sponsorship/i.test(q)));

    for (const radio of radios) {
        assert.equal(
            radio.required,
            true,
            `${radio.question} should be required from title *`,
        );
        assert.deepEqual([...(radio.options || [])].map(String), ['Yes', 'No']);
    }

    const fields = radios.map((el, index) => ({
        id: index,
        ref: el.ref || `f${index}`,
        label: el.question,
        field_type: 'radio',
        options: el.options,
        required: true,
    }));
    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: {
            ...UK_PROFILE,
            application_settings: {
                ...UK_PROFILE.application_settings,
                affirm_local_hybrid: 'yes',
            },
        },
        questionMemo: { yes: 'on' },
        pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
    });
    const staged = Object.fromEntries(
        (plan.applyStages || [])
            .flatMap((stage) => stage.answers || [])
            .map((row) => [
                fields.find((f) => f.ref === row.ref)?.label || row.ref,
                String(row.answer),
            ]),
    );

    const rtw = Object.keys(staged).find((label) =>
        /legally authorized/i.test(label),
    );
    const hybrid = Object.keys(staged).find((label) => /hybrid/i.test(label));
    const sponsor = Object.keys(staged).find((label) =>
        /sponsorship/i.test(label),
    );

    assert.ok(rtw, JSON.stringify(staged));
    assert.match(staged[rtw], /^yes$/i);
    assert.ok(hybrid, JSON.stringify(staged));
    assert.match(staged[hybrid], /^yes$/i);
    assert.ok(sponsor, JSON.stringify(staged));
    assert.match(staged[sponsor], /^no$/i);

    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        sponsor,
        'No',
    );
    assert.equal(applied, true);
    assert.equal(window.document.getElementById('sponsor-no')?.checked, true);
    assert.equal(window.document.getElementById('sponsor-yes')?.checked, false);
});

test('SDUI weekly-fail fixture inventories radios/years and plans Yes/No + digits (not city)', async () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-weekly-fail-radios-years.html',
        ),
        'utf8',
    );
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4471603025/',
    );
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: UK_PROFILE },
        {},
        {},
    );

    const radios = (snapshot.elements || []).filter(
        (el) => el.field_type === 'radio',
    );
    const numbers = (snapshot.elements || []).filter(
        (el) =>
            el.field_type === 'number' ||
            /years of/i.test(String(el.question || '')),
    );
    const questions = radios.map((el) => String(el.question || ''));

    assert.ok(
        radios.length >= 5,
        `expected sponsorship/remote/5+/commute/10+ radios, got ${JSON.stringify(questions)}`,
    );
    assert.ok(
        !questions.some((q) => /^yes$/i.test(q.trim())),
        `must not inventory option label as question, got ${JSON.stringify(questions)}`,
    );
    assert.ok(questions.some((q) => /sponsorship/i.test(q)));
    assert.ok(questions.some((q) => /remote setting/i.test(q)));
    assert.ok(questions.some((q) => /5\+\s*years/i.test(q)));
    assert.ok(questions.some((q) => /commuting to this job/i.test(q)));
    assert.ok(questions.some((q) => /10\+\s*years/i.test(q)));
    assert.ok(
        numbers.length >= 3,
        `expected Python/Engineering/Agentic years, got ${JSON.stringify(
            numbers.map((el) => el.question),
        )}`,
    );

    for (const radio of radios) {
        assert.equal(
            radio.required,
            true,
            `${radio.question} should be required from title *`,
        );
    }

    const fields = (snapshot.elements || []).map((el, index) => ({
        id: index,
        ref: el.ref || `f${index}`,
        label: el.question,
        field_type: el.field_type,
        options: el.options,
        required: Boolean(el.required),
        max_chars: el.max_chars,
        dom: el.dom,
    }));
    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: {
            ...UK_PROFILE,
            application_settings: {
                ...UK_PROFILE.application_settings,
                years_of_experience: '8',
                affirm_local_commute: 'yes',
                affirm_local_hybrid: 'yes',
                expected_salary_yearly: '100000',
            },
        },
        questionMemo: { yes: 'on' },
        pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
    });

    const staged = Object.fromEntries(
        (plan.applyStages || [])
            .flatMap((stage) =>
                (stage.answers || []).map((row) => ({
                    ...row,
                    stage: stage.type,
                })),
            )
            .map((row) => [
                fields.find((f) => f.ref === row.ref)?.label || row.ref,
                { answer: String(row.answer), stage: row.stage },
            ]),
    );

    const commute = Object.keys(staged).find((label) =>
        /commuting to this job/i.test(label),
    );
    assert.ok(commute, `commute missing from plan: ${JSON.stringify(staged)}`);
    assert.match(
        staged[commute].answer,
        /^yes$/i,
        `commute must be Yes, not city; got ${JSON.stringify(staged[commute])}`,
    );
    assert.notEqual(staged[commute].stage, 'identity');

    const sponsor = Object.keys(staged).find((label) =>
        /sponsorship/i.test(label),
    );
    assert.ok(sponsor);
    assert.match(staged[sponsor].answer, /^no$/i);

    const remote = Object.keys(staged).find((label) =>
        /remote setting/i.test(label),
    );
    assert.ok(remote);
    assert.match(staged[remote].answer, /^yes$/i);

    const yoe5 = Object.keys(staged).find((label) =>
        /5\+\s*years/i.test(label),
    );
    assert.ok(yoe5);
    assert.match(staged[yoe5].answer, /^yes$/i);

    const python = Object.keys(staged).find((label) => /python/i.test(label));
    assert.ok(python);
    assert.match(staged[python].answer, /^\d+$/);

    const salary = Object.keys(staged).find((label) => /salary/i.test(label));
    assert.ok(salary);
    assert.match(staged[salary].answer, /100000/);

    const english = Object.keys(staged).find((label) =>
        /proficiency in english/i.test(label),
    );
    assert.ok(
        english,
        `english proficiency missing: ${JSON.stringify(staged)}`,
    );
    assert.match(staged[english].answer, /native|bilingual|professional/i);

    const appliedCommute =
        await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
            window.document,
            commute,
            'Yes',
        );
    assert.equal(appliedCommute, true);
    assert.equal(window.document.getElementById('commute-yes')?.checked, true);

    const appliedYears =
        await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
            window.document,
            python,
            staged[python].answer,
        );
    assert.equal(appliedYears, true);
    assert.equal(
        window.document.getElementById('years-python-numeric')?.value,
        staged[python].answer,
    );
});

test('SDUI page-level role=group does not merge Yes/No groups; snapshot log carries radio diag', () => {
    const fixture = readFileSync(
        join(
            ROOT,
            'tests/fixtures/auto-apply/linkedin-sdui-nofieldset-radios.html',
        ),
        'utf8',
    );
    // Live variant: no name= on inputs and one page-level [role="group"] whose
    // aria-labelledby heading would otherwise label every group the same.
    const html = fixture
        .replace(/\sname="urn:li:fsd_formElement:[^"]*"/g, '')
        .replace(
            '<h3>Additional Questions</h3>',
            '<div role="group" aria-labelledby="addq-heading"><h3 id="addq-heading">Additional Questions</h3>',
        )
        .replace(/(<\/div>\s*<\/div>\s*<\/body>)/, '</div>$1');
    const window = loadLinkedInWindow(
        html,
        'https://www.linkedin.com/jobs/view/4471603025/',
    );
    const logs = [];
    window.AutoCVApplyDebugLog = {
        logDebug: (...args) => logs.push(args),
        logInfo: (...args) => logs.push(args),
        logWarn: (...args) => logs.push(args),
        logError: (...args) => logs.push(args),
    };

    assert.ok(
        window.document.querySelector('[role="group"] .fb-dash-form-element'),
    );

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: UK_PROFILE },
        {},
        {},
    );
    const radios = (snapshot.elements || []).filter(
        (el) => el.field_type === 'radio',
    );
    const questions = radios.map((el) => String(el.question || ''));

    assert.equal(radios.length, 3, JSON.stringify(questions));
    assert.ok(
        !questions.some((q) => /additional questions/i.test(q)),
        JSON.stringify(questions),
    );
    assert.ok(
        radios.every((el) => el.required === true),
        JSON.stringify(radios.map((r) => r.required)),
    );

    const build = logs.find(
        ([, phase, message]) =>
            phase === 'snapshot.build' && /Easy Apply modal/.test(message),
    );
    assert.ok(build, 'snapshot.build log emitted');
    const data = build[3];
    assert.equal(data.radioDiag, 'linkedin-radio-diag-v1');
    assert.equal(data.radioSummary.length, 3);

    for (const row of data.radioSummary) {
        assert.equal(
            row.groupRoot,
            'fb-dash-form-element',
            JSON.stringify(row),
        );
        assert.equal(row.groupKey, 'linkedin-title', JSON.stringify(row));
        assert.equal(
            row.requiredStrategy,
            'linkedin-required-class',
            JSON.stringify(row),
        );
        assert.ok(
            row.labelStrategy && row.labelStrategy !== 'no-diag',
            JSON.stringify(row),
        );
    }

    // Diagnostics must never leak into the snapshot payload.
    assert.ok(
        radios.every((el) => !('_diag' in el) && !('labelStrategy' in el)),
    );
});
