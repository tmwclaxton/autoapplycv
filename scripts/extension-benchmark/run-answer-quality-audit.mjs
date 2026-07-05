#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const sailBin = join(ROOT, 'vendor/bin/sail');

if (!process.env.NANOGPT_LIVE_TESTS) {
    console.log('Skipping NanoGPT answer quality audit. Set NANOGPT_LIVE_TESTS=1 with Sail running.');
    process.exit(0);
}

const limit = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const useSail = existsSync(sailBin);
const command = useSail ? sailBin : 'php';
const args = useSail
    ? ['artisan', 'answer-quality:audit', ...(limit ? [`--limit=${limit}`] : [])]
    : ['artisan', 'answer-quality:audit', ...(limit ? [`--limit=${limit}`] : [])];

const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: ROOT,
});

process.exit(result.status ?? 1);
