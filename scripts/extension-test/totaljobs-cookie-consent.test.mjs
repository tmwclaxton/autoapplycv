import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TOTALJOBS_PATH = join(ROOT, 'extension/src/content/totaljobs-auto-apply.js');

test('Totaljobs cookie consent handles Stepstone ccmgt accept control', () => {
    const source = readFileSync(TOTALJOBS_PATH, 'utf8');

    assert.match(source, /#ccmgt_explicit_accept/);
    assert.match(source, /cookieConsentRootSelector/);
    assert.match(source, /aria-label="cookieconsent"/);
    assert.match(source, /accept all cookies|agree and close/i);
});
