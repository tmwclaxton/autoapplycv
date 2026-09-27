#!/usr/bin/env node
/**
 * LinkedIn /jobs/search-results/ SDUI job cards (componentkey job-card-component-ref-*).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
    countLinkedInJobCardSelectorMatches,
    jobCardHasEasyApply,
    parseLinkedInJobCards,
    readCompanyFromCard,
    readJobIdFromCard,
    readJobIdFromComponentKey,
    readJobTitleFromCard,
    resolveSduiJobCardRoot,
} from '../../extension/src/shared/linkedin-platform.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SDUI_FIXTURE = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin-search-results-sdui.html',
);
const LEGACY_FIXTURE = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin-search-results.html',
);
const PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');
const AUTO_APPLY_SCRIPT = join(
    ROOT,
    'extension/src/content/linkedin-auto-apply.js',
);

test('parses SDUI search-results cards with Easy Apply hydration', () => {
    const html = readFileSync(SDUI_FIXTURE, 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://www.linkedin.com/jobs/search-results/?keywords=AI%20engineer&f_AL=true',
    });
    const cards = parseLinkedInJobCards(dom.window.document);

    assert.equal(cards.length, 3, `expected 3 cards, got ${cards.length}`);
    assert.equal(cards[0].jobId, '4470303932');
    assert.match(cards[0].title, /Founding AI Engineer/i);
    assert.doesNotMatch(cards[0].title, /^Selected,/i);
    assert.equal(cards[0].company, 'Oho Group');
    assert.match(String(cards[0].location || ''), /London Area/i);
    assert.equal(cards[0].easyApply, true);
    assert.equal(cards[0].alreadyApplied, false);

    assert.equal(cards[1].jobId, '4464070069');
    assert.equal(cards[1].title, 'Senior AI Engineer');
    assert.equal(cards[1].company, 'Acme Labs');
    assert.equal(cards[1].easyApply, true);

    assert.equal(cards[2].jobId, '4467970885');
    assert.equal(cards[2].easyApply, false);
});

test('SDUI selector diagnostics report componentkey matches', () => {
    const html = readFileSync(SDUI_FIXTURE, 'utf8');
    const dom = new JSDOM(html);
    const matches = countLinkedInJobCardSelectorMatches(dom.window.document);
    const sduiRoleButton = matches.find((row) =>
        row.selector.includes('[role="button"]'),
    );
    const legacyListItem = matches.find((row) =>
        row.selector.includes('scaffold-layout__list-item'),
    );

    assert.ok(sduiRoleButton);
    assert.equal(sduiRoleButton.count, 3);
    assert.ok(legacyListItem);
    assert.equal(legacyListItem.count, 0);
});

test('legacy search fixture still parses', () => {
    const html = readFileSync(LEGACY_FIXTURE, 'utf8');
    const cards = parseLinkedInJobCards(new JSDOM(html).window.document);

    assert.ok(cards.length >= 1);
    assert.ok(cards.every((card) => card.jobId));
});

test('content-script parser matches shared platform parser on SDUI fixture', () => {
    const html = readFileSync(SDUI_FIXTURE, 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://www.linkedin.com/jobs/search-results/?keywords=AI%20engineer',
        pretendToBeVisual: true,
    });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Element = window.Element;

    eval(readFileSync(PARSER_SCRIPT, 'utf8'));
    eval(readFileSync(AUTO_APPLY_SCRIPT, 'utf8'));

    const shared = parseLinkedInJobCards(window.document);
    const content = window.AutoCVApplyLinkedInParser.parseLinkedInJobCards(
        window.document,
    );
    const viaApi = window.AutoCVApplyLinkedInAutoApply.collectJobCards();
    const diagnostics =
        window.AutoCVApplyLinkedInAutoApply.collectJobCardDiagnostics();

    assert.equal(content.length, shared.length);
    assert.deepEqual(
        content.map((card) => card.jobId),
        shared.map((card) => card.jobId),
    );
    assert.equal(viaApi.length, 3);
    assert.ok(
        diagnostics.some(
            (row) =>
                row.selector.includes('job-card-component-ref') &&
                row.count >= 3,
        ),
    );

    const card = window.AutoCVApplyLinkedInAutoApply.findJobCardById(
        '4470303932',
    );
    assert.ok(card, 'expected SDUI card lookup by componentkey');
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(
        card.getAttribute('componentkey'),
        'job-card-component-ref-4470303932',
    );
});

test('componentkey helpers extract and dedupe nested SDUI roots', () => {
    assert.equal(
        readJobIdFromComponentKey('job-card-component-ref-4470303932'),
        '4470303932',
    );

    const html = readFileSync(SDUI_FIXTURE, 'utf8');
    const dom = new JSDOM(html);
    const inner = dom.window.document.querySelector(
        'div[componentkey="job-card-component-ref-4470303932"]:not([role="button"])',
    );
    const root = resolveSduiJobCardRoot(inner);

    assert.equal(root.getAttribute('role'), 'button');
    assert.equal(readJobIdFromCard(inner), '4470303932');
    assert.match(readJobTitleFromCard(root), /Founding AI Engineer/i);
    assert.equal(readCompanyFromCard(root), 'Oho Group');
    assert.equal(jobCardHasEasyApply(root), true);
});
