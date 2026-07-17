#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
    buildJobSearchUrl,
    LINKEDIN_PLATFORM_ID,
} from '../../extension/src/shared/auto-apply-platforms.js';
import {
    buildLinkedInJobOpenUrl,
    buildLinkedInJobSearchUrl,
    isLinkedInJobViewUrl,
    isLinkedInJobsApplySurfaceUrl,
    isLinkedInJobsSearchUrl,
    jobCardHasEasyApply,
    jobCardIsAlreadyApplied,
    LINKEDIN_DRAFT_ALL_REQUIRES_EASY_APPLY,
    parseLinkedInJobCards,
    readJobIdFromCard,
    resolveLinkedInDraftAllGuard,
} from '../../extension/src/shared/linkedin-platform.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin-search-results.html',
);
const SCROLL_FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin-search-results-scroll.html',
);
const JOB_DETAIL_FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin-job-detail-easy-apply.html',
);
const JOB_VIEW_FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin-job-view-easy-apply.html',
);
const SUCCESS_SUBMITTED_FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/edge-success-submitted.html',
);
const AUTO_APPLY_SCRIPT = join(
    ROOT,
    'extension/src/content/linkedin-auto-apply.js',
);
const PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');

function loadLinkedInAutoApplyApi(
    html,
    url = 'https://www.linkedin.com/jobs/search/?keywords=engineer',
) {
    const dom = new JSDOM(html, { pretendToBeVisual: true, url });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.CSS = window.CSS || {
        escape: (value) =>
            String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"'),
    };

    eval(readFileSync(PARSER_SCRIPT, 'utf8'));
    eval(readFileSync(AUTO_APPLY_SCRIPT, 'utf8'));

    return window.AutoCVApplyLinkedInAutoApply;
}

const cases = [
    {
        name: 'builds LinkedIn search URL with Easy Apply filter',
        fn: () => {
            const url = buildLinkedInJobSearchUrl(
                'software engineer remote UK',
            );
            const parsed = new URL(url);

            assert.equal(parsed.hostname, 'www.linkedin.com');
            assert.equal(
                parsed.searchParams.get('keywords'),
                'software engineer remote UK',
            );
            assert.equal(parsed.searchParams.get('f_AL'), 'true');
        },
    },
    {
        name: 'buildJobSearchUrl delegates to LinkedIn driver',
        fn: () => {
            const url = buildJobSearchUrl(
                LINKEDIN_PLATFORM_ID,
                'backend engineer',
            );
            assert.match(url, /linkedin\.com\/jobs\/search/);
        },
    },
    {
        name: 'builds LinkedIn search URL with native filter params',
        fn: () => {
            const url = buildLinkedInJobSearchUrl('software engineer', {
                filters: {
                    location: 'United Kingdom',
                    workType: 'remote',
                    experience: 'mid_senior',
                    datePosted: 'week',
                    minSalaryUk: '80k',
                },
            });
            const parsed = new URL(url);

            assert.equal(
                parsed.searchParams.get('keywords'),
                'software engineer',
            );
            assert.equal(parsed.searchParams.get('location'), 'United Kingdom');
            assert.equal(parsed.searchParams.get('f_WT'), '2');
            assert.equal(parsed.searchParams.get('f_E'), '4');
            assert.equal(parsed.searchParams.get('f_TPR'), 'r604800');
            assert.equal(parsed.searchParams.get('f_SB2'), '4');
            assert.equal(parsed.searchParams.get('f_AL'), 'true');
        },
    },
    {
        name: 'omits empty LinkedIn filter params',
        fn: () => {
            const url = buildLinkedInJobSearchUrl('designer', {
                filters: { workType: '', experience: '' },
            });
            const parsed = new URL(url);

            assert.equal(parsed.searchParams.get('keywords'), 'designer');
            assert.equal(parsed.searchParams.has('f_WT'), false);
            assert.equal(parsed.searchParams.has('f_E'), false);
            assert.equal(parsed.searchParams.has('location'), false);
        },
    },
    {
        name: 'detects LinkedIn jobs search URLs',
        fn: () => {
            assert.equal(
                isLinkedInJobsSearchUrl(
                    'https://www.linkedin.com/jobs/search/?keywords=engineer',
                ),
                true,
            );
            assert.equal(
                isLinkedInJobsSearchUrl(
                    'https://www.linkedin.com/jobs/search-results/?currentJobId=1',
                ),
                true,
            );
            assert.equal(
                isLinkedInJobsSearchUrl('https://www.linkedin.com/feed/'),
                false,
            );
        },
    },
    {
        name: 'Draft All requires open Easy Apply on LinkedIn jobs surfaces',
        fn: () => {
            const searchResultsUrl =
                'https://www.linkedin.com/jobs/search-results/?currentJobId=4440534304';

            assert.equal(isLinkedInJobsApplySurfaceUrl(searchResultsUrl), true);
            assert.equal(
                isLinkedInJobsApplySurfaceUrl(
                    'https://www.linkedin.com/jobs/view/4440534304/',
                ),
                true,
            );
            assert.equal(
                isLinkedInJobsApplySurfaceUrl('https://www.linkedin.com/feed/'),
                false,
            );
            assert.equal(
                resolveLinkedInDraftAllGuard(searchResultsUrl, { open: false }),
                LINKEDIN_DRAFT_ALL_REQUIRES_EASY_APPLY,
            );
            assert.equal(
                resolveLinkedInDraftAllGuard(searchResultsUrl, null),
                LINKEDIN_DRAFT_ALL_REQUIRES_EASY_APPLY,
            );
            assert.equal(
                resolveLinkedInDraftAllGuard(searchResultsUrl, { open: true }),
                null,
            );
            assert.equal(
                resolveLinkedInDraftAllGuard('https://boards.greenhouse.io/x', {
                    open: false,
                }),
                null,
            );
        },
    },
    {
        name: 'buildLinkedInJobOpenUrl keeps search context with currentJobId',
        fn: () => {
            const searchUrl =
                'https://www.linkedin.com/jobs/search/?keywords=junior+software+engineer&f_AL=true';
            const openUrl = buildLinkedInJobOpenUrl('4375167862', {
                currentUrl: searchUrl,
            });
            const parsed = new URL(openUrl);

            assert.equal(parsed.pathname, '/jobs/search/');
            assert.equal(parsed.searchParams.get('currentJobId'), '4375167862');
            assert.equal(
                parsed.searchParams.get('keywords'),
                'junior software engineer',
            );
        },
    },
    {
        name: 'buildLinkedInJobOpenUrl prefers standalone job view when requested',
        fn: () => {
            const searchUrl =
                'https://www.linkedin.com/jobs/search/?keywords=junior+software+engineer&f_AL=true';
            const openUrl = buildLinkedInJobOpenUrl('4375167862', {
                currentUrl: searchUrl,
                preferJobView: true,
            });

            assert.equal(
                openUrl,
                'https://www.linkedin.com/jobs/view/4375167862/',
            );
            assert.equal(isLinkedInJobViewUrl(openUrl), true);
        },
    },
    {
        name: 'buildLinkedInJobOpenUrl falls back to job view page',
        fn: () => {
            const openUrl = buildLinkedInJobOpenUrl('4433753816');
            assert.equal(
                openUrl,
                'https://www.linkedin.com/jobs/view/4433753816/',
            );
            assert.equal(isLinkedInJobViewUrl(openUrl), true);
        },
    },
    {
        name: 'reveals off-screen job cards by scrolling the results list',
        fn: async () => {
            const html = readFileSync(SCROLL_FIXTURE_PATH, 'utf8');
            const api = loadLinkedInAutoApplyApi(html);
            const listRoot = document.querySelector(
                '.jobs-search-results-list',
            );
            const startScroll = listRoot.scrollTop;

            const card = await api.revealJobCardById('4375167862');

            assert.ok(
                card,
                'expected scrolled job card to become discoverable',
            );
            assert.match(card.textContent || '', /Junior Software Engineer/i);
            assert.ok(
                listRoot.scrollTop >= startScroll,
                'expected results list scroll position to advance',
            );
        },
    },
    {
        name: 'selectJobById returns needsNavigation when card cannot be revealed',
        fn: async () => {
            const html =
                '<main><section class="jobs-details"><h1>No list</h1></section></main>';
            const api = loadLinkedInAutoApplyApi(html);

            const result = await api.selectJobById('4375167862');

            assert.equal(result.success, false);
            assert.equal(result.needsNavigation, true);
        },
    },
    {
        name: 'waitForJobDetailReady resolves on job detail Easy Apply button',
        fn: async () => {
            const html = readFileSync(JOB_DETAIL_FIXTURE_PATH, 'utf8');
            const api = loadLinkedInAutoApplyApi(
                html,
                'https://www.linkedin.com/jobs/view/4411111111/',
            );

            const result = await api.waitForJobDetailReady('4411111111');

            assert.equal(result.success, true);
            assert.equal(api.readTopCardApplyButton()?.tagName, 'BUTTON');
            assert.match(
                api.readTopCardApplyButton()?.getAttribute('aria-label') || '',
                /Easy Apply/i,
            );
        },
    },
    {
        name: 'waitForJobDetailReady resolves Easy Apply on standalone job view page',
        fn: async () => {
            const html = readFileSync(JOB_VIEW_FIXTURE_PATH, 'utf8');
            const api = loadLinkedInAutoApplyApi(
                html,
                'https://www.linkedin.com/jobs/view/4433753816/',
            );

            const result = await api.waitForJobDetailReady('4433753816');
            const button = api.readTopCardApplyButton();
            const state = api.readApplyButtonState(button);

            assert.equal(result.success, true);
            assert.ok(button, 'expected job view Easy Apply button');
            assert.equal(state.easyApply, true);
            assert.match(state.label, /Easy Apply/i);
        },
    },
    {
        name: 'detects LinkedIn Apply aria-label as Easy Apply on job view page',
        fn: () => {
            const html = `
                <main class="job-view-layout">
                    <button
                        type="button"
                        class="jobs-apply-button artdeco-button"
                        aria-label="LinkedIn Apply to Software Engineer at Homey"
                        style="display: inline-block; position: absolute; width: 120px; height: 40px;"
                    >
                        Apply
                    </button>
                </main>
            `;
            const api = loadLinkedInAutoApplyApi(
                html,
                'https://www.linkedin.com/jobs/view/4411223344/',
            );
            const state = api.readApplyButtonState(
                api.readTopCardApplyButton(),
            );

            assert.equal(state.easyApply, true);
            assert.match(
                api.readTopCardApplyButton()?.getAttribute('aria-label') || '',
                /LinkedIn Apply/i,
            );
        },
    },
    {
        name: 'resolves nested Easy Apply button inside top-card wrapper div',
        fn: async () => {
            const html = readFileSync(
                join(
                    ROOT,
                    'tests/fixtures/auto-apply/linkedin-job-detail-easy-apply-wrapper.html',
                ),
                'utf8',
            );
            const api = loadLinkedInAutoApplyApi(
                html,
                'https://www.linkedin.com/jobs/search/?keywords=junior+software+engineer&currentJobId=4411111111',
            );

            const button = api.readTopCardApplyButton();

            assert.ok(button, 'expected detail-panel Easy Apply button');
            assert.equal(button.tagName, 'BUTTON');
            assert.match(
                button.getAttribute('aria-label') || '',
                /Junior QA Automation Engineer/i,
            );
            assert.equal(
                button.closest('.job-card-container'),
                null,
                'should not pick list-card button',
            );
        },
    },
    {
        name: 'parses fixture job cards',
        fn: () => {
            const html = readFileSync(FIXTURE_PATH, 'utf8');
            const dom = new JSDOM(html);
            const cards = parseLinkedInJobCards(dom.window.document);

            assert.equal(cards.length, 3);
            assert.equal(cards[0].jobId, '100001');
            assert.equal(cards[0].title, 'Senior Software Engineer');
            assert.equal(cards[0].company, 'Acme Labs');
            assert.equal(cards[0].easyApply, true);
            assert.equal(cards[0].alreadyApplied, false);
            assert.equal(cards[1].alreadyApplied, true);
            assert.equal(cards[2].easyApply, false);
        },
    },
    {
        name: 'reads job id from card anchor href',
        fn: () => {
            const html = '<li><a href="/jobs/view/424242">Role</a></li>';
            const dom = new JSDOM(html);
            const card = dom.window.document.querySelector('li');

            assert.equal(readJobIdFromCard(card), '424242');
            assert.equal(jobCardHasEasyApply(card), false);
            assert.equal(jobCardIsAlreadyApplied(card), false);
        },
    },
    {
        name: 'reads job title from aria-label when card text is sparse',
        fn: () => {
            const html =
                '<li data-occludable-job-id="999"><a href="/jobs/view/999" aria-label="Staff Engineer with verification in London"></a></li>';
            const dom = new JSDOM(html);
            const card = dom.window.document.querySelector('li');

            assert.equal(readJobIdFromCard(card), '999');
            assert.match(
                parseLinkedInJobCards(dom.window.document)[0].title,
                /Staff Engineer/i,
            );
        },
    },
    {
        name: 'detects fixed-position Easy Apply modal and Next button',
        fn: () => {
            const html = readFileSync(
                join(
                    ROOT,
                    'tests/fixtures/auto-apply/linkedin-easy-apply-modal.html',
                ),
                'utf8',
            );
            const dom = new JSDOM(html, { pretendToBeVisual: true });
            const { window } = dom;

            globalThis.window = window;
            globalThis.document = window.document;
            globalThis.HTMLElement = window.HTMLElement;
            globalThis.MouseEvent = window.MouseEvent;

            eval(
                readFileSync(
                    join(ROOT, 'extension/src/content/linkedin-auto-apply.js'),
                    'utf8',
                ),
            );

            const api = window.AutoCVApplyLinkedInAutoApply;
            const modal = api.readEasyApplyModal();

            assert.ok(modal, 'expected Easy Apply modal to be visible');
            assert.equal(api.getEasyApplyModalState().open, true);
            assert.equal(api.getEasyApplyModalState().canContinue, true);
            assert.match(api.findPrimaryActionButton()?.label || '', /next/i);
            assert.match(api.readStepFingerprint() || '', /Contact info/);
        },
    },
    {
        name: 'prefers Submit application over Next in modal footer',
        fn: () => {
            const html = `
                <div class="jobs-easy-apply-modal" role="dialog" style="position:fixed; inset:0;">
                    <div class="jobs-easy-apply-content"><h3>Review your application</h3></div>
                    <footer class="jobs-easy-apply-footer">
                        <button class="artdeco-button artdeco-button--secondary">Back</button>
                        <button class="artdeco-button artdeco-button--primary">Next</button>
                        <button class="artdeco-button artdeco-button--primary" aria-label="Submit application">Submit application</button>
                    </footer>
                </div>
            `;
            const dom = new JSDOM(html, { pretendToBeVisual: true });
            const { window } = dom;

            globalThis.window = window;
            globalThis.document = window.document;
            globalThis.HTMLElement = window.HTMLElement;
            globalThis.MouseEvent = window.MouseEvent;

            eval(
                readFileSync(
                    join(ROOT, 'extension/src/content/linkedin-auto-apply.js'),
                    'utf8',
                ),
            );

            const state =
                window.AutoCVApplyLinkedInAutoApply.getEasyApplyModalState();

            assert.equal(state.canSubmit, true);
            assert.match(state.submitLabel || '', /submit application/i);
        },
    },
    {
        name: 'detects and dismisses Save this application confirmation dialog',
        fn: async () => {
            const html = readFileSync(
                join(
                    ROOT,
                    'tests/fixtures/auto-apply/linkedin/edge-save-application-dialog.html',
                ),
                'utf8',
            );
            const dom = new JSDOM(html, { pretendToBeVisual: true });
            const { window } = dom;

            globalThis.window = window;
            globalThis.document = window.document;
            globalThis.HTMLElement = window.HTMLElement;
            globalThis.MouseEvent = window.MouseEvent;

            eval(
                readFileSync(
                    join(ROOT, 'extension/src/content/linkedin-auto-apply.js'),
                    'utf8',
                ),
            );

            const api = window.AutoCVApplyLinkedInAutoApply;

            assert.ok(
                api.findSaveApplicationDialog(),
                'expected save-application dialog',
            );

            const discardButton = api
                .findSaveApplicationDialog()
                .querySelector('[data-test-dialog-secondary-btn]');
            assert.ok(discardButton, 'expected Discard button');
            assert.match(discardButton.textContent || '', /discard/i);

            const result = await api.dismissSaveApplicationDialog();
            assert.equal(result.dismissed, true);
            assert.equal(result.action, 'discard');
        },
    },
    {
        name: 'accepts LinkedIn cookie consent banner',
        fn: async () => {
            const html = readFileSync(
                join(
                    ROOT,
                    'tests/fixtures/auto-apply/linkedin/edge-cookie-consent.html',
                ),
                'utf8',
            );
            const dom = new JSDOM(html, { pretendToBeVisual: true });
            const { window } = dom;

            globalThis.window = window;
            globalThis.document = window.document;
            globalThis.HTMLElement = window.HTMLElement;
            globalThis.MouseEvent = window.MouseEvent;

            eval(
                readFileSync(
                    join(ROOT, 'extension/src/content/linkedin-auto-apply.js'),
                    'utf8',
                ),
            );

            const api = window.AutoCVApplyLinkedInAutoApply;

            assert.ok(
                api.findCookieConsentAlert(),
                'expected cookie consent alert',
            );

            const acceptButton = api
                .findCookieConsentAlert()
                .querySelector('[data-test-global-alert-action="0"]');
            assert.ok(acceptButton, 'expected Accept button');
            assert.match(acceptButton.textContent || '', /accept/i);

            const result = await api.acceptCookieConsent();
            assert.equal(result.accepted, true);
        },
    },
    {
        name: 'marks application success screen as submitted',
        fn: () => {
            const html = readFileSync(SUCCESS_SUBMITTED_FIXTURE_PATH, 'utf8');
            const api = loadLinkedInAutoApplyApi(
                html,
                'https://www.linkedin.com/jobs/view/4411111111/',
            );
            const state = api.getEasyApplyModalState();
            const verify = api.verifySubmitted();

            assert.equal(state.submitted, true);
            assert.match(
                state.confirmation || '',
                /application sent|application was sent/i,
            );
            assert.equal(verify.submitted, true);
        },
    },
    {
        name: 'waits for delayed LinkedIn submission confirmation',
        fn: async () => {
            const reviewStepHtml = `
                <div class="jobs-easy-apply-modal" role="dialog" style="position:fixed; inset:0; display:block;">
                    <div class="jobs-easy-apply-content"><h3>Review your application</h3></div>
                </div>
            `;
            const api = loadLinkedInAutoApplyApi(reviewStepHtml);

            setTimeout(() => {
                document.querySelector('.jobs-easy-apply-content').innerHTML =
                    '<h3>Application sent</h3><p>Your application was sent.</p>';
            }, 100);

            const verify = await api.waitForSubmissionConfirmation(1_000);

            assert.equal(verify.submitted, true);
            assert.match(
                verify.confirmation || '',
                /application sent|application was sent/i,
            );
        },
    },
    {
        name: 'classifies Submit label as submit action',
        fn: () => {
            const contactStepHtml = `
                <div class="jobs-easy-apply-modal" role="dialog" style="position:fixed; inset:0; display:block;">
                    <div class="jobs-easy-apply-content"><h3>Contact info</h3>
                        <input type="text" value="Alex" />
                    </div>
                    <footer class="jobs-easy-apply-footer">
                        <button class="artdeco-button artdeco-button--primary">Submit</button>
                    </footer>
                </div>
            `;
            const api = loadLinkedInAutoApplyApi(contactStepHtml);
            const primary = api.findPrimaryActionButton();

            assert.equal(primary?.action, 'submit');
            assert.match(primary?.label || '', /submit/i);
        },
    },
    {
        name: 'clickNextOrSubmit returns submitted on success screen without clicking Done',
        fn: async () => {
            const html = readFileSync(SUCCESS_SUBMITTED_FIXTURE_PATH, 'utf8');
            const api = loadLinkedInAutoApplyApi(
                html,
                'https://www.linkedin.com/jobs/view/4411111111/',
            );
            const result = await api.clickNextOrSubmit();

            assert.equal(result.success, true);
            assert.equal(result.submitted, true);
            assert.match(
                result.confirmation || '',
                /application was sent|Application sent/i,
            );
        },
    },
    {
        name: 'detects empty Easy Apply shell with Next and loader as not ready',
        fn: () => {
            const emptyShellHtml = `
                <div data-test-modal="" role="dialog" class="artdeco-modal jobs-easy-apply-modal" style="position:fixed; inset:0; display:block;">
                  <h2 id="jobs-apply-header">Apply to Oho Group</h2>
                  <div class="jobs-easy-apply-modal__content">
                    <div role="region" aria-label="Your job application progress is at 0 percent.">
                      <progress max="100" value="0" aria-valuenow="0"></progress>
                      <form>
                        <div class="ph5"></div>
                        <footer>
                          <p>Submitting this application won't change your LinkedIn profile.</p>
                          <button data-easy-apply-next-button="" aria-label="Continue to next step" class="artdeco-button artdeco-button--primary" type="button">Next</button>
                        </footer>
                      </form>
                      <div class="jobs-loader" style="width:40px;height:40px;">
                        <div class="artdeco-loader"><span class="artdeco-loader__bars"></span></div>
                      </div>
                    </div>
                  </div>
                </div>
            `;
            const api = loadLinkedInAutoApplyApi(
                emptyShellHtml,
                'https://www.linkedin.com/jobs/view/4436226474/',
            );
            const state = api.getEasyApplyModalState();

            assert.equal(state.open, true);
            assert.equal(state.action, 'next');
            assert.equal(state.canContinue, true);
            assert.equal(state.hasContent, false);
            assert.equal(state.emptyShell, true);
            assert.equal(state.loading, true);
        },
    },
    {
        name: 'marks contact step with fields as hasContent',
        fn: () => {
            const contactHtml = `
                <div class="jobs-easy-apply-modal" role="dialog" style="position:fixed; inset:0; display:block;">
                    <h2>Contact info</h2>
                    <div class="jobs-easy-apply-content">
                        <label>First name</label>
                        <input type="text" name="firstName" />
                        <label>Email</label>
                        <input type="email" name="email" />
                    </div>
                    <footer class="jobs-easy-apply-footer">
                        <button class="artdeco-button artdeco-button--primary" data-easy-apply-next-button="">Next</button>
                    </footer>
                </div>
            `;
            const api = loadLinkedInAutoApplyApi(contactHtml);
            const state = api.getEasyApplyModalState();

            assert.equal(state.open, true);
            assert.equal(state.hasContent, true);
            assert.equal(state.emptyShell, false);
            assert.equal(state.action, 'next');
        },
    },
];

for (const testCase of cases) {
    await testCase.fn();
    console.log(`ok - ${testCase.name}`);
}

console.log(`\n${cases.length} linkedin auto-apply unit checks passed.`);
