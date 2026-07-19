#!/usr/bin/env node
/**
 * Generate + stamp NanoGPT routing cases until at least --target kept cases exist.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = join(ROOT, 'tests/fixtures/draft-all/heuristics-routing-nanogpt.json');

function parseArgs(argv) {
    const args = {
        target: 500,
        chunk: 150,
        batch: 25,
        concurrency: 8,
        maxRounds: 6,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--target') {
            args.target = Number.parseInt(argv[++i], 10);
        } else if (arg === '--chunk') {
            args.chunk = Number.parseInt(argv[++i], 10);
        } else if (arg === '--batch') {
            args.batch = Number.parseInt(argv[++i], 10);
        } else if (arg === '--concurrency') {
            args.concurrency = Number.parseInt(argv[++i], 10);
        } else if (arg === '--max-rounds') {
            args.maxRounds = Number.parseInt(argv[++i], 10);
        }
    }

    return args;
}

function keptCount() {
    if (!existsSync(FIXTURE)) {
        return 0;
    }

    const corpus = JSON.parse(readFileSync(FIXTURE, 'utf8'));

    return Array.isArray(corpus.cases) ? corpus.cases.length : 0;
}

function mergeFixtures(previousPath, incomingPath) {
    const previous = existsSync(previousPath)
        ? JSON.parse(readFileSync(previousPath, 'utf8'))
        : { cases: [] };
    const incoming = JSON.parse(readFileSync(incomingPath, 'utf8'));
    const seen = new Set();
    const merged = [];

    for (const caseRow of [...(previous.cases || []), ...(incoming.cases || [])]) {
        const key = String(caseRow.label || '').toLowerCase().trim();

        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        merged.push(caseRow);
    }

    const next = {
        ...incoming,
        ...previous,
        generated_at: incoming.generated_at || previous.generated_at,
        model: incoming.model || previous.model,
        seed: incoming.seed ?? previous.seed,
        concurrency: incoming.concurrency ?? previous.concurrency,
        count: merged.length,
        cases: merged,
        merged_from_rounds: true,
    };

    writeFileSync(FIXTURE, `${JSON.stringify(next, null, 2)}\n`);
}

function run(cmd, args) {
    const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });

    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed with status ${result.status}`);
    }
}

const args = parseArgs(process.argv.slice(2));
const tempPath = join(ROOT, 'tests/fixtures/draft-all/heuristics-routing-nanogpt.chunk.json');
let round = 0;

while (keptCount() < args.target && round < args.maxRounds) {
    round += 1;
    const need = args.chunk;

    console.log(`\n[round ${round}] kept=${keptCount()} target=${args.target} generating=${need}`);

    run('php', [
        'artisan',
        'draft-all:generate-routing-corpus',
        `--count=${need}`,
        `--batch=${args.batch}`,
        `--concurrency=${args.concurrency}`,
        `--output=tests/fixtures/draft-all/heuristics-routing-nanogpt.chunk.json`,
    ]);

    if (existsSync(FIXTURE) && keptCount() > 0 && existsSync(tempPath)) {
        // Preserve previous stamped/unstamped cases, then re-stamp everything.
        const backup = join(ROOT, 'tests/fixtures/draft-all/heuristics-routing-nanogpt.prev.json');
        writeFileSync(backup, readFileSync(FIXTURE));
        mergeFixtures(backup, tempPath);
    } else if (existsSync(tempPath)) {
        writeFileSync(FIXTURE, readFileSync(tempPath));
    }

    run('node', [join(ROOT, 'scripts/extension-test/stamp-routing-corpus.mjs')]);
}

const finalCount = keptCount();
console.log(`\nDone. kept=${finalCount} target=${args.target} rounds=${round}`);

if (finalCount < args.target) {
    process.exit(1);
}
