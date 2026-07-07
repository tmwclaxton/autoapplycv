import { writeFileSync } from 'node:fs';
import { minifyHtmlFixture } from './minify-html-fixture.mjs';
import { redactSecrets } from './redact-secrets.mjs';

/**
 * Write scraped HTML to the fixture directory with secrets redacted.
 *
 * @param {string} filePath
 * @param {string} html
 * @param {{ minify?: boolean, pageTitle?: string }} [options]
 */
export function writeHtmlFixture(filePath, html, options = {}) {
    const minify = options.minify !== false;
    const redacted = redactSecrets(html);
    const output = minify ? minifyHtmlFixture(redacted, { pageTitle: options.pageTitle }) : redacted;

    writeFileSync(filePath, output);
}
