import { writeFileSync } from 'node:fs';
import { minifyHtmlFixture } from './minify-html-fixture.mjs';
import { redactSecrets } from './redact-secrets.mjs';
import { isJsHeavyHost } from './scrape-url-queue.mjs';

/**
 * @param {string | undefined | null} url
 * @param {boolean | undefined} explicitMinify
 * @returns {boolean}
 */
export function shouldMinifyHtmlFixture(url, explicitMinify) {
    if (explicitMinify === true || explicitMinify === false) {
        return explicitMinify;
    }

    if (!url) {
        return true;
    }

    return !isJsHeavyHost(url);
}

/**
 * Write scraped HTML to the fixture directory with secrets redacted.
 *
 * @param {string} filePath
 * @param {string} html
 * @param {{ minify?: boolean, pageTitle?: string, url?: string }} [options]
 */
export function writeHtmlFixture(filePath, html, options = {}) {
    const minify = shouldMinifyHtmlFixture(options.url, options.minify);
    const redacted = redactSecrets(html);
    const output = minify ? minifyHtmlFixture(redacted, { pageTitle: options.pageTitle }) : redacted;

    writeFileSync(filePath, output);
}
