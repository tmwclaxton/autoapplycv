/**
 * LinkedIn Draft All inventory scoping:
 * - Easy Apply modal open → modal only
 * - Modal closed on jobs SERP → job detail only (no SERP filter harvest)
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
const LINKEDIN_PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');
const LINKEDIN_AUTO_APPLY_SCRIPT = join(ROOT, 'extension/src/content/linkedin-auto-apply.js');

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button, [role="dialog"]').forEach((el) => {
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

const SERP_WITH_FILTERS_HTML = `<!doctype html>
<html>
<body>
  <aside class="search-reusables__filter-list" id="serp-filters">
    <fieldset>
      <legend>Filters</legend>
      <label><input type="checkbox" name="f_AL" value="true"> Easy Apply</label>
      <label><input type="checkbox" name="f_WT" value="2"> Remote</label>
      <label><input type="checkbox" name="f_E" value="4"> Mid-Senior</label>
    </fieldset>
  </aside>
  <div class="jobs-search-results-list">
    <ul><li data-occludable-job-id="1">Engineer</li></ul>
  </div>
  <div class="jobs-search__job-details" id="job-detail-pane">
    <div class="jobs-unified-top-card">
      <h1>Software Engineer</h1>
      <button type="button" class="jobs-apply-button">Easy Apply</button>
    </div>
    <div id="job-details">
      <p>Build APIs and ship features.</p>
    </div>
  </div>
</body>
</html>`;

const EASY_APPLY_MODAL_HTML = `<!doctype html>
<html>
<body>
  <aside class="search-reusables__filter-list">
    <label><input type="checkbox" name="f_AL" value="true"> Easy Apply</label>
    <label><input type="checkbox" name="f_WT" value="2"> Remote</label>
  </aside>
  <div class="jobs-search__job-details">
    <button type="button">Easy Apply</button>
  </div>
  <div class="jobs-easy-apply-modal" role="dialog" aria-modal="true">
    <div class="jobs-easy-apply-content">
      <form>
        <label>Email <input type="email" name="email" value="" required></label>
        <label>Phone <input type="tel" name="phone" value="" required></label>
        <label>Years of experience
          <input type="text" name="years" value="" required>
        </label>
      </form>
    </div>
    <footer>
      <button type="button">Next</button>
    </footer>
  </div>
</body>
</html>`;

function loadInventoryWindow(html, pageUrl, { withLinkedIn = false } = {}) {
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
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
        .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');

    vm.runInContext(VISIBILITY_PATCH, context);
    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);

    if (withLinkedIn) {
        const parser = readFileSync(LINKEDIN_PARSER_SCRIPT, 'utf8')
            .replace('const AutoCVApplyLinkedInParser =', 'globalThis.AutoCVApplyLinkedInParser =');
        const autoApply = readFileSync(LINKEDIN_AUTO_APPLY_SCRIPT, 'utf8')
            .replace('const AutoCVApplyLinkedInAutoApply =', 'globalThis.AutoCVApplyLinkedInAutoApply =');

        vm.runInContext(parser, context);
        vm.runInContext(autoApply, context);
    }

    return window;
}

test('LinkedIn SERP without Easy Apply scopes inventory away from filter checkboxes', () => {
    const window = loadInventoryWindow(
        SERP_WITH_FILTERS_HTML,
        'https://www.linkedin.com/jobs/search-results/?currentJobId=1',
        { withLinkedIn: true },
    );

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { full_name: 'Test User', email: 'test@example.com' } },
        {},
        {},
    );

    const questions = (snapshot.elements || []).map((element) =>
        String(element.question || '').toLowerCase(),
    );
    const hasFilterFacet = questions.some((question) =>
        /\beasy apply\b|\bremote\b|\bmid-senior\b|\bfilters?\b/.test(question),
    );

    assert.equal(
        hasFilterFacet,
        false,
        `SERP filters must not be inventoried, got: ${JSON.stringify(questions)}`,
    );
    assert.ok(Array.isArray(snapshot.elements));
});

test('LinkedIn Easy Apply modal open scopes inventory to modal fields', () => {
    const window = loadInventoryWindow(
        EASY_APPLY_MODAL_HTML,
        'https://www.linkedin.com/jobs/search/?currentJobId=1',
        { withLinkedIn: true },
    );

    assert.ok(
        window.AutoCVApplyLinkedInAutoApply?.readEasyApplyModal?.(),
        'expected Easy Apply modal to be detected',
    );

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { full_name: 'Test User', email: 'test@example.com' } },
        {},
        {},
    );

    const questions = (snapshot.elements || []).map((element) =>
        String(element.question || '').toLowerCase(),
    );
    const hasEmail = questions.some((question) => question.includes('email'));
    const hasPhone = questions.some((question) => question.includes('phone'));
    const hasFilterOnly = questions.some((question) =>
        question === 'remote' || question === 'easy apply' || question.includes('f_wt'),
    );

    assert.equal(hasEmail, true, `expected email field, got: ${JSON.stringify(questions)}`);
    assert.equal(hasPhone, true, `expected phone field, got: ${JSON.stringify(questions)}`);
    assert.equal(
        hasFilterOnly,
        false,
        `modal scope must exclude SERP filters, got: ${JSON.stringify(questions)}`,
    );
});

test('non-LinkedIn pages still inventory the full document', () => {
    const html = `<!doctype html><html><body>
      <form>
        <label>Full name <input type="text" name="name" required></label>
        <label>Email <input type="email" name="email" required></label>
      </form>
    </body></html>`;
    const window = loadInventoryWindow(html, 'https://boards.greenhouse.io/example/jobs/1');
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { full_name: 'Test User', email: 'test@example.com' } },
        {},
        {},
    );
    const questions = (snapshot.elements || []).map((element) =>
        String(element.question || '').toLowerCase(),
    );

    assert.ok(
        questions.some((question) => question.includes('name') || question.includes('email')),
        `expected ATS fields, got: ${JSON.stringify(questions)}`,
    );
});
