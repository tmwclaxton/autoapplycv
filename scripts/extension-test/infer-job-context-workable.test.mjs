import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { tryInferJobContextFromPage } = await import(
    pathToFileURL(
        join(ROOT, 'extension/src/shared/draft-all-optimizations.js'),
    ).href
);

test('infers Booksy from apply.workable.com account slug', () => {
    const inferred = tryInferJobContextFromPage({
        page_url: 'https://apply.workable.com/booksy-1/j/B23F702280/apply/',
        page_title:
            'Product Manager (Early Careers Programme) (m/f/d) - Booksy - Application',
        page_text: 'x'.repeat(250),
    });

    assert.equal(inferred?.company, 'Booksy');
    assert.equal(inferred?.source, 'workable');
    assert.match(inferred?.title || '', /Product Manager/i);
});

test('infers company from Workable page title when URL slug is generic', () => {
    const inferred = tryInferJobContextFromPage({
        page_url: 'https://apply.workable.com/j/ABCDEF/apply/',
        page_title: 'Staff Engineer - Acme Robotics - Application',
        page_text: '',
    });

    assert.equal(inferred?.company, 'Acme Robotics');
});
