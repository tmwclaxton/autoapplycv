#!/usr/bin/env node
/**
 * Sequential overnight dual-oracle batches (max 50 each). One at a time.
 * Usage: node scripts/form-corpus/run-overnight-500-batches.mjs --start=8 --end=22
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDualOracle300Progress } from './lib/dual-oracle-300-progress.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STATUS = join(FIXTURE_ROOT, 'overnight-500-status.log');
const META = join(FIXTURE_ROOT, 'overnight-500-meta.json');

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));

  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function log(line) {
  const row = `${new Date().toISOString()} ${line}`;
  console.log(row);
  appendFileSync(STATUS, `${row}\n`);
}

function competingOracle() {
  const result = spawnSync('ps', ['aux'], { encoding: 'utf8' });
  const lines = (result.stdout || '')
    .split('\n')
    .filter((l) => /curated-oracle-capture\.mjs|run-dual-oracle-300/.test(l) && !/rg |run-overnight-500/.test(l));

  return lines;
}

function main() {
  const start = Number(parseArg('start', '8'));
  const end = Number(parseArg('end', '22'));
  const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : { baseline_agrees: 0 };
  const baseline = meta.baseline_agrees || 0;

  for (let i = start; i <= end; i += 1) {
    const progress = loadDualOracle300Progress();
    const newAgrees = progress.agree_ids.length - baseline;

    if (progress.agree_ids.length >= (progress.target || 664)) {
      log(`STOP target reached agrees=${progress.agree_ids.length} new=${newAgrees}`);
      break;
    }

    if (newAgrees >= 500) {
      log(`STOP goal 500 new reached agrees=${progress.agree_ids.length} new=${newAgrees}`);
      break;
    }

    const comps = competingOracle();

    if (comps.length) {
      log(`ABORT competing oracle: ${comps[0]?.slice(0, 120)}`);
      process.exit(1);
    }

    const batchId = `oracle-url-queue-batch-${String(i).padStart(2, '0')}`;
    const urlsFile = join(FIXTURE_ROOT, `${batchId}.json`);

    if (!existsSync(urlsFile)) {
      log(`SKIP missing ${batchId}`);
      continue;
    }

    const before = progress.agree_ids.length;
    log(`START ${batchId} cumulative=${before} new=${before - baseline}`);
    const result = spawnSync(
      process.execPath,
      [
        'scripts/form-corpus/curated-oracle-capture.mjs',
        '--limit=50',
        `--urls-file=${urlsFile}`,
        `--batch-id=${batchId}`,
      ],
      { cwd: ROOT, stdio: 'inherit', env: process.env },
    );

    const afterProg = loadDualOracle300Progress();
    const after = afterProg.agree_ids.length;
    const batch = afterProg.batches?.[afterProg.batches.length - 1] || {};
    log(
      `END ${batchId} exit=${result.status} agrees_batch=${batch.agree ?? '?'} disagree=${batch.disagree ?? '?'} error=${batch.error ?? '?'} cumulative=${after} new=${after - baseline} tabs_closed=reuse-one`,
    );

    if (result.status !== 0) {
      log(`WARN ${batchId} non-zero exit; continuing`);
    }
  }

  const final = loadDualOracle300Progress();
  log(`DONE overnight chain agrees=${final.agree_ids.length} new=${final.agree_ids.length - baseline} target=${final.target}`);
}

main();
