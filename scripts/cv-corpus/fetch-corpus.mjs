#!/usr/bin/env node
/**
 * Download public CV samples and invoke Laravel generators for the stress-test corpus.
 *
 * Usage: node scripts/cv-corpus/fetch-corpus.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const corpusRoot = path.join(repoRoot, 'tests/fixtures/cv-corpus');
const sourcesPath = path.join(__dirname, 'sources.json');

async function download(url, destination) {
    const response = await fetch(url, { redirect: 'follow' });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length < 512) {
        throw new Error(`File too small (${buffer.length} bytes) for ${url}`);
    }

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);

    return buffer.length;
}

async function main() {
    const sources = JSON.parse(await readFile(sourcesPath, 'utf8'));
    const results = [];

    for (const entry of sources.downloads ?? []) {
        const destination = path.join(corpusRoot, entry.file);
        process.stdout.write(`Downloading ${entry.id}... `);

        try {
            const bytes = await download(entry.url, destination);
            results.push({ id: entry.id, status: 'ok', bytes });
            console.log(`${bytes} bytes`);
        } catch (error) {
            results.push({ id: entry.id, status: 'failed', error: String(error.message ?? error) });
            console.log(`FAILED (${error.message ?? error})`);
        }
    }

    const generate = spawnSync('php', ['artisan', 'cv:corpus-generate', '--no-interaction'], {
        cwd: repoRoot,
        stdio: 'inherit',
    });

    if (generate.status !== 0) {
        process.exit(generate.status ?? 1);
    }

    const annotate = spawnSync('php', ['artisan', 'cv:corpus-annotate', '--no-interaction'], {
        cwd: repoRoot,
        stdio: 'inherit',
    });

    if (annotate.status !== 0) {
        process.exit(annotate.status ?? 1);
    }

    const failed = results.filter((row) => row.status === 'failed');

    if (failed.length > 0) {
        console.warn('\nSome downloads failed (corpus may still be usable):');
        for (const row of failed) {
            console.warn(`  - ${row.id}: ${row.error}`);
        }
    }

    console.log(`\nCorpus ready under ${corpusRoot}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
