#!/usr/bin/env node
/**
 * Vet all pending scenarios in a single Node process (avoids manifest write races).
 */
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vetScript = join(root, 'scripts/form-corpus/vet-corpus.mjs');

const prefixes = process.argv.slice(2);

if (prefixes.length === 0) {
    prefixes.push('syn-mega', 'syn-fw', 'syn-ix', 'syn-', 'web-');
}

const manifest = loadManifest();
const pending = manifest.scenarios.filter((row) => (row.status ?? '') !== 'vetted');

console.log(`Pending scenarios: ${pending.length}`);

for (const prefix of prefixes) {
    const count = pending.filter((row) => row.id.startsWith(prefix)).length;

    if (count === 0) {
        continue;
    }

    console.log(`Vetting prefix ${prefix} (${count} pending)…`);
    execFileSync(process.execPath, [vetScript, `--id-prefix=${prefix}`, '--pending-only', '--slim-report'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096' },
    });
}

const finalManifest = loadManifest();
const totals = { vetted: 0, rejected: 0, pending: 0 };

for (const row of finalManifest.scenarios) {
    totals[row.status ?? 'pending'] = (totals[row.status ?? 'pending'] || 0) + 1;
}

console.log(`Done: ${finalManifest.scenarios.length} scenarios`, totals);
