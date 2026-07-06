#!/usr/bin/env node
/**
 * Fail when scraped HTML fixtures contain known secret patterns.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecretMatches } from './form-corpus/lib/redact-secrets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIRS = [
    join(ROOT, 'tests/fixtures/form-extraction/html'),
    join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured'),
];

async function collectHtmlFixtures() {
    /** @type {{ dirLabel: string, filename: string, path: string }[]} */
    const files = [];

    for (const dir of FIXTURE_DIRS) {
        let entries = [];

        try {
            entries = await readdir(dir);
        } catch {
            continue;
        }

        const dirLabel = dir.replace(`${ROOT}/`, '');

        for (const filename of entries.filter((name) => name.endsWith('.html')).sort()) {
            files.push({
                dirLabel,
                filename,
                path: join(dir, filename),
            });
        }
    }

    return files;
}

async function main() {
    const htmlFiles = await collectHtmlFixtures();

    /** @type {{ file: string, label: string, match: string }[]} */
    const violations = [];

    for (const entry of htmlFiles) {
        const content = await readFile(entry.path, 'utf8');

        for (const { label, match } of findSecretMatches(content)) {
            violations.push({
                file: `${entry.dirLabel}/${entry.filename}`,
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
