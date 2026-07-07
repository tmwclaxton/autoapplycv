#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { minifyHtmlFixture } from './lib/minify-html-fixture.mjs';
import { HTML_DIR } from './lib/paths.mjs';
import { redactSecrets } from './lib/redact-secrets.mjs';

const files = process.argv.slice(2);

if (files.length === 0) {
    console.error('Usage: node scripts/form-corpus/minify-html-fixtures.mjs <fixture.html> [...]');
    process.exit(1);
}

for (const fileArg of files) {
    const filePath = fileArg.includes('/') ? fileArg : join(HTML_DIR, fileArg);
    const before = readFileSync(filePath, 'utf8').length;
    const title = basename(filePath, '.html').replace(/-/g, ' ');
    const minified = minifyHtmlFixture(redactSecrets(readFileSync(filePath, 'utf8')), { pageTitle: title });

    writeFileSync(filePath, minified);

    console.log(`${basename(filePath)}: ${before} -> ${minified.length} bytes`);
}
