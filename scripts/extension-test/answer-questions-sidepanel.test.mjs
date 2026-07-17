#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sidepanelHtml = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.html'), 'utf8');
const sidepanelJs = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.js'), 'utf8');
const sidepanelCss = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.css'), 'utf8');
const contentJs = readFileSync(join(ROOT, 'extension/src/content/index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8'));

test('Answer All Questions on Web Page lives in always-visible auth chrome', () => {
    const authStart = sidepanelHtml.indexOf('id="auth-state"');
    const tabsStart = sidepanelHtml.indexOf('<nav class="tabs">');
    const buttonMarkup = sidepanelHtml.indexOf('id="answer-questions-btn"');
    const buttonLabel = sidepanelHtml.indexOf('Answer All Questions on Web Page');
    const assistTab = sidepanelHtml.indexOf('id="assist-tab"');

    assert.ok(authStart > -1, 'auth-state should exist');
    assert.ok(tabsStart > authStart, 'tabs should follow auth chrome');
    assert.ok(buttonMarkup > authStart && buttonMarkup < tabsStart, 'button should be above tabs');
    assert.ok(buttonLabel > authStart && buttonLabel < tabsStart, 'label should be above tabs');
    assert.ok(assistTab > tabsStart, 'assist tab content should follow tabs');
    assert.equal(sidepanelHtml.includes('Draft All'), false, 'UI should not show Draft All label');
    assert.match(sidepanelHtml, /aria-label="Answer All Questions on Web Page"/);
});

test('sidepanel wires Answer All Questions on Web Page to START_DRAFT_ALL', () => {
    assert.match(sidepanelJs, /START_DRAFT_ALL/);
    assert.match(sidepanelJs, /answer-questions-btn/);
    assert.match(sidepanelJs, /ANSWER_QUESTIONS_LABEL\s*=\s*'Answer All Questions on Web Page'/);
});

test('Answer All Questions on Web Page uses a darker red than the default postbox button', () => {
    assert.match(sidepanelCss, /#answer-questions-btn\s*\{[^}]*background:\s*#a50d25/s);
});

test('on-page portal bar Draft All control is removed', () => {
    assert.equal(contentJs.includes('AutoCVApplyPortalBar'), false);
    assert.equal(manifest.content_scripts?.[0]?.js?.includes('portal-bar.js'), false);
});
