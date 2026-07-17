import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/content/cv-library-auto-apply.js');

test('CV-Library Easy Apply matches apply-now and 1-click-apply data-qa controls', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.match(source, /data-qa\^="apply-now"/);
    assert.match(source, /data-qa\^="1-click-apply"/);
    assert.match(source, /\/job\/apply\//);
});
