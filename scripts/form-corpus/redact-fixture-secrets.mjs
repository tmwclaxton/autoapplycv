#!/usr/bin/env node
/**
 * One-time (or repeat) redaction of secrets in committed HTML fixtures.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HTML_DIR } from './lib/paths.mjs';
import { findSecretMatches, htmlContainsSecrets, redactSecrets, SECRET_PATTERNS } from './lib/redact-secrets.mjs';

const dryRun = process.argv.includes('--dry-run');

async function main() {
    const entries = await readdir(HTML_DIR);
    const htmlFiles = entries.filter((name) => name.endsWith('.html')).sort();

    let scanned = 0;
    let redactedFiles = 0;
    /** @type {Record<string, number>} */
    const matchCounts = Object.fromEntries(SECRET_PATTERNS.map(({ label }) => [label, 0]));

    for (const filename of htmlFiles) {
        const filePath = join(HTML_DIR, filename);
        const content = await readFile(filePath, 'utf8');
        scanned += 1;

        if (!htmlContainsSecrets(content)) {
            continue;
        }

        for (const { label, match } of findSecretMatches(content)) {
            matchCounts[label] = (matchCounts[label] || 0) + 1;

            if (dryRun) {
                console.log(`${filename}: ${label} (${match.slice(0, 24)}…)`);
            }
        }

        if (!dryRun) {
            await writeFile(filePath, redactSecrets(content), 'utf8');
        }

        redactedFiles += 1;
    }

    console.log(`Scanned ${scanned} HTML fixture(s).`);

    if (redactedFiles === 0) {
        console.log('No secret patterns found.');

        return;
    }

    console.log(`${dryRun ? 'Would redact' : 'Redacted'} ${redactedFiles} file(s):`);

    for (const [label, count] of Object.entries(matchCounts)) {
        if (count > 0) {
            console.log(`  ${label}: ${count} match(es)`);
        }
    }

    if (dryRun) {
        console.log('Dry run only. Re-run without --dry-run to write changes.');
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
