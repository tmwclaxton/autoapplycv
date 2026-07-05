#!/usr/bin/env node
/**
 * Fail (or --fix) when U+2014 em dashes appear in tracked source files.
 *
 * Scope: .php, .js, .mjs, .vue, .md, .mdc
 * Excludes: vendor, node_modules, build output, scraped HTML fixtures.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EM_DASH = '\u2014';

const SCANNED_EXTENSIONS = new Set(['.php', '.js', '.mjs', '.vue', '.md', '.mdc']);

const EXCLUDED_DIR_NAMES = new Set([
    '.git',
    'bootstrap/cache',
    'coverage',
    'dist',
    'node_modules',
    'public/build',
    'storage',
    'vendor',
]);

const EXCLUDED_PATH_PREFIXES = [
    'tests/fixtures/form-extraction/html/',
    'tests/fixtures/form-fill-baselines/',
];

const fixMode = process.argv.includes('--fix');

/** @param {string} absolutePath */
function isExcluded(absolutePath) {
    const rel = `${relative(ROOT, absolutePath).replaceAll('\\', '/')}/`;

    for (const prefix of EXCLUDED_PATH_PREFIXES) {
        if (rel.startsWith(prefix)) {
            return true;
        }
    }

    return false;
}

/** @param {string} dir */
async function walk(dir) {
    /** @type {string[]} */
    const files = [];

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const absolutePath = join(dir, entry.name);

        if (entry.isDirectory()) {
            if (EXCLUDED_DIR_NAMES.has(entry.name)) {
                continue;
            }

            files.push(...(await walk(absolutePath)));
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        if (!SCANNED_EXTENSIONS.has(extname(entry.name))) {
            continue;
        }

        if (isExcluded(absolutePath)) {
            continue;
        }

        files.push(absolutePath);
    }

    return files;
}

/** @param {string} filePath @param {string} content */
function findEmDashLines(filePath, content) {
    const rel = relative(ROOT, filePath).replaceAll('\\', '/');
    /** @type {{ file: string, line: number, text: string }[]} */
    const hits = [];

    for (const [index, line] of content.split('\n').entries()) {
        if (!line.includes(EM_DASH)) {
            continue;
        }

        hits.push({
            file: rel,
            line: index + 1,
            text: line.trim(),
        });
    }

    return hits;
}

async function main() {
    /** @type {{ file: string, line: number, text: string }[]} */
    const violations = [];
    let fixedFiles = 0;

    const files = await walk(ROOT);

    for (const filePath of files) {
        const content = await readFile(filePath, 'utf8');

        if (!content.includes(EM_DASH)) {
            continue;
        }

        if (fixMode) {
            const next = content.replaceAll(EM_DASH, '-');
            await writeFile(filePath, next, 'utf8');
            fixedFiles += 1;
            continue;
        }

        violations.push(...findEmDashLines(filePath, content));
    }

    if (fixMode) {
        console.log(`Replaced em dashes in ${fixedFiles} file(s).`);

        return;
    }

    if (violations.length === 0) {
        console.log('No em dashes found in scanned source files.');

        return;
    }

    console.error(`Found ${violations.length} em dash(es) in scanned source files:\n`);

    for (const hit of violations) {
        console.error(`${hit.file}:${hit.line}: ${hit.text}`);
    }

    console.error('\nReplace U+2014 (-) with hyphen-minus (-), or run: npm run em-dash:fix');
    process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
