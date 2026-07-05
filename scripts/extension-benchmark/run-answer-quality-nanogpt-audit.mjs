#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!process.env.NANOGPT_LIVE_TESTS) {
    console.log('Skipping NanoGPT answer quality audit. Set NANOGPT_LIVE_TESTS=1 with Sail running.');
    process.exit(0);
}

const args = ['artisan', 'answer-quality:audit', '--fail'];

if (process.env.ANSWER_QUALITY_LIMIT) {
    args.push(`--limit=${process.env.ANSWER_QUALITY_LIMIT}`);
}

const sail = './vendor/bin/sail';
const command = existsSync(sail) ? sail : 'php';
const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
});

process.exit(result.status ?? 1);
