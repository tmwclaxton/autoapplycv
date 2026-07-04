#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildE2eManifest, E2E_MANIFEST_PATH } from './lib/e2e-scenarios.mjs';

const manifest = buildE2eManifest();

mkdirSync(dirname(E2E_MANIFEST_PATH), { recursive: true });
writeFileSync(E2E_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${manifest.totals.active} active E2E scenarios (${manifest.totals.skipped} skipped) → ${E2E_MANIFEST_PATH}`);
console.log(`CI subset: ${manifest.totals.ci} scenarios`);
