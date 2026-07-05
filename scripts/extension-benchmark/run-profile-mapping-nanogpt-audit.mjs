#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

if (!process.env.NANOGPT_LIVE_TESTS) {
    console.log('Skipping NanoGPT profile mapping audit. Set NANOGPT_LIVE_TESTS=1 with Sail running.');
    process.exit(0);
}

const result = spawnSync(
    'php',
    ['artisan', 'test', '--compact', '--filter=ProfileMappingNanoGptTest'],
    { stdio: 'inherit', env: process.env },
);

process.exit(result.status ?? 1);
