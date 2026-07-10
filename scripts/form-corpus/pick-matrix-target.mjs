#!/usr/bin/env node
/**
 * Print one matrix target cell for AI/Firecrawl batch briefs.
 *
 * Usage:
 *   node scripts/form-corpus/pick-matrix-target.mjs
 *   node scripts/form-corpus/pick-matrix-target.mjs --batch-index=3
 */
import { pickMatrixTargetCell } from './lib/pick-matrix-target.mjs';

function parseArg(name, fallback = '0') {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

const batchIndex = Number(parseArg('batch-index', '0'));
const cell = pickMatrixTargetCell(batchIndex);

if (!cell) {
    process.exit(1);
}

console.log(cell);
