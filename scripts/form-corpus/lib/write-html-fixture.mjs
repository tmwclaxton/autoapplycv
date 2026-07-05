import { writeFileSync } from 'node:fs';
import { redactSecrets } from './redact-secrets.mjs';

/**
 * Write scraped HTML to the fixture directory with secrets redacted.
 *
 * @param {string} filePath
 * @param {string} html
 */
export function writeHtmlFixture(filePath, html) {
    writeFileSync(filePath, redactSecrets(html));
}
