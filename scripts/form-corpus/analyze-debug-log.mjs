#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLogExport, summarizeLogExport } from './lib/debug-log-analyzer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))?.split('=')[1];
const goldenArg = process.argv.find((arg) => arg.startsWith('--golden='))?.split('=')[1];
const jsonOnly = process.argv.includes('--json-only');

if (!inputArg) {
    console.error('Usage: node scripts/form-corpus/analyze-debug-log.mjs --input=<export.json> [--golden=<summary.json>]');
    process.exit(1);
}

const exportPayload = JSON.parse(readFileSync(inputArg, 'utf8'));
const summary = summarizeLogExport(exportPayload);

if (!goldenArg) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
}

const golden = JSON.parse(readFileSync(goldenArg, 'utf8'));
const result = analyzeLogExport(exportPayload, golden);

if (!jsonOnly) {
    console.log(result.passed ? 'PASSED' : 'FAILED');

    if (result.failures.length > 0) {
        console.error(result.failures.join('\n'));
    }
}

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
    process.exit(1);
}
