#!/usr/bin/env node
/**
 * Ashby Places often returns Wycombe, Queensland ahead of High Wycombe UK.
 * Scoring must prefer UK options and never first-option fallback to Australia.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

function loadHeuristics() {
    const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://jobs.ashbyhq.com/example/application',
    });
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        Element: context.Element,
        HTMLElement: context.HTMLElement,
        Node: context.Node,
        Event: context.Event,
        getComputedStyle: context.getComputedStyle.bind(context),
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(heuristicsScript, sandbox);

    return context.AutoCVApplyFormHeuristics;
}

test('Ashby UK location scoring prefers High Wycombe over Queensland', () => {
    const H = loadHeuristics();
    const answers = ['Wycombe, England', 'High Wycombe, England', 'Wycombe'];
    const options = [
        'Wycombe, Queensland, Australia',
        'High Wycombe, Buckinghamshire, England, United Kingdom',
        'England Creek, Queensland, Australia',
    ];

    for (const answer of answers) {
        const scores = options.map((option) =>
            H.scoreAshbyLocationOptionMatch(option, answer),
        );

        assert.equal(scores[0], 0, `Australia must score 0 for ${answer}`);
        assert.ok(
            scores[1] >= 100,
            `High Wycombe UK must clear threshold for ${answer}`,
        );
        assert.ok(
            scores[1] > scores[0],
            `UK option must beat Australia for ${answer}`,
        );
    }

    const source = readFileSync(FORM_HEURISTICS_PATH, 'utf8');
    assert.match(source, /scoreAshbyLocationOptionMatch/);
    assert.match(source, /expandAshbyLocationTypedQueries/);
    assert.match(source, /High Wycombe, United Kingdom/);
    assert.match(source, /Ashby location skipped first-option fallback/);
    assert.match(
        source,
        /never let bare optionMatchesAnswer promote/,
    );
});

test('Ashby location helpers expand truncated Wycombe queries', () => {
    const source = readFileSync(FORM_HEURISTICS_PATH, 'utf8');
    assert.match(source, /High Wycombe, Buckinghamshire, United Kingdom/);
    assert.match(source, /optionLooksForeignToUkLocation/);
});
