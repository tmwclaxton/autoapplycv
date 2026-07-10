#!/usr/bin/env node
/**
 * Compose AI form brief JSON for a fixture id.
 *
 * Usage:
 *   node scripts/form-corpus/compose-ai-brief.mjs --id=syn-ai-0001
 *   node scripts/form-corpus/compose-ai-brief.mjs --id=syn-ai-0001 --target-cell=ashby,combobox,single-page,medium
 */
import { composeAiFormBrief } from './lib/ai-form-brief.mjs';

function parseArg(name) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : null;
}

const id = parseArg('id');

if (!id) {
    console.error('Usage: compose-ai-brief.mjs --id=syn-ai-0001 [--target-cell=...] [--seed=123]');
    process.exit(1);
}

const seedArg = parseArg('seed');
const brief = composeAiFormBrief({
    id,
    seed: seedArg ? Number(seedArg) : undefined,
    targetCell: parseArg('target-cell'),
    complexityTier: parseArg('complexity-tier') || 'standard',
});

console.log(JSON.stringify(brief, null, 2));
