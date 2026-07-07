#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findButtonByText, parseButtonsFromHtml } from './lib/parse-page-buttons.mjs';

const html = readFileSync('tests/fixtures/form-extraction/html/syn-indeed-apply-contact-001.html', 'utf8');
const buttons = parseButtonsFromHtml(html);

assert.ok(buttons.length >= 1, 'expected at least one button in Indeed contact fixture');

const continueButton = findButtonByText(html, 'Continue');

assert.ok(continueButton, 'expected Continue button from HTML parse');
assert.ok(continueButton.selector.includes('data-testid'), 'expected data-testid selector for Indeed Continue');
assert.equal(continueButton.text, 'Continue');

console.log('parse-page-buttons tests passed.');
