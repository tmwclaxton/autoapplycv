#!/usr/bin/env node
/**
 * Fail when scraped HTML fixtures contain known secret patterns.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecretMatches } from './form-corpus/lib/redact-secrets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_DIR = join(ROOT, 'tests/fixtures/form-extraction/html');

async function main() {
    const entries = await readdir(HTML_DIR);
    const htmlFiles = entries.filter((name) => name.endsWith('.html')).sort();

    /** @type {{ file: string, label: string, match: string }[]} */
    const violations = [];

    for (const filename of htmlFiles) {
        const content = await readFile(join(HTML_DIR, filename), 'utf8');

        for (const { label, match } of findSecretMatches(content)) {
            violations.push({
                file: filename,
                label,
                match: match.length > 48 ? `${match.slice(0, 48)}…` : match,
            });
        }
    }

    if (violations.length === 0) {
        console.log(`No secret patterns found in ${htmlFiles.length} HTML fixture(s).`);

        return;
    }

    console.error(`Found ${violations.length} secret pattern match(es) in HTML fixtures:\n`);

    for (const hit of violations.slice(0, 50)) {
        console.error(`${hit.file}: ${hit.label} (${hit.match})`);
    }

    if (violations.length > 50) {
        console.error(`… and ${violations.length - 50} more`);
    }

    console.error('\nRun: npm run form-corpus:redact-secrets');

    process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
