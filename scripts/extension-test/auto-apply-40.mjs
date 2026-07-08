#!/usr/bin/env node
/**
 * Run LinkedIn (20) + Indeed (20) = 40 applications via extension bridge.
 * Tracks cumulative progress across restarts in progress file.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MARATHON = join(ROOT, 'scripts/extension-test/auto-apply-marathon.mjs');
const PROGRESS_PATH = '/tmp/auto-apply-40-progress.json';
const LOG_PATH = '/tmp/auto-apply-40.log';
const TARGET_EACH = 20;
const ROLE = process.env.AUTO_APPLY_ROLE || 'software engineer';

function loadProgress() {
    if (!existsSync(PROGRESS_PATH)) {
        return { linkedin: 0, indeed: 0 };
    }

    try {
        return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
    } catch {
        return { linkedin: 0, indeed: 0 };
    }
}

function saveProgress(progress) {
    writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

function runMarathon(platform, target, extraArgs = []) {
    return new Promise((resolve, reject) => {
        const args = [
            MARATHON,
            `--platform=${platform}`,
            `--target=${target}`,
            `--role=${ROLE}`,
            `--location=${platform === 'linkedin' ? 'United Kingdom' : 'London'}`,
            '--timeout=21600000',
            ...extraArgs,
        ];

        if (platform === 'linkedin') {
            args.push('--work-type=remote');
        }

        console.log(`[40] ${platform}: need ${target} more (progress file: ${PROGRESS_PATH})`);

        const child = spawn(process.execPath, args, {
            cwd: ROOT,
            stdio: 'inherit',
            env: process.env,
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${platform} marathon exited ${code}`));
            }
        });
    });
}

async function readReportApplied(platform) {
    const reportPath = join(ROOT, 'tests/fixtures/form-extraction/auto-apply-marathon-report.json');

    if (!existsSync(reportPath)) {
        return 0;
    }

    try {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'));

        if (report.platform !== platform) {
            return 0;
        }

        return Number(report.totals?.applied || 0);
    } catch {
        return 0;
    }
}

async function main() {
    const bridge = await fetch('http://127.0.0.1:7433/status').then((response) => response.json()).catch(() => null);

    if (!bridge?.extensionConnected) {
        throw new Error('Extension bridge not connected.');
    }

    let progress = loadProgress();

    while (progress.linkedin < TARGET_EACH) {
        const need = TARGET_EACH - progress.linkedin;

        try {
            await runMarathon('linkedin', need);
        } catch (error) {
            console.warn(`[40] linkedin run ended: ${error.message}`);
        }

        const batch = await readReportApplied('linkedin');
        progress.linkedin = Math.min(TARGET_EACH, progress.linkedin + batch);
        saveProgress(progress);
        console.log(`[40] linkedin progress: ${progress.linkedin}/${TARGET_EACH}`);

        if (progress.linkedin >= TARGET_EACH) {
            break;
        }

        await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    while (progress.indeed < TARGET_EACH) {
        const need = TARGET_EACH - progress.indeed;

        try {
            await runMarathon('indeed', need);
        } catch (error) {
            console.warn(`[40] indeed run ended: ${error.message}`);
        }

        const batch = await readReportApplied('indeed');
        progress.indeed = Math.min(TARGET_EACH, progress.indeed + batch);
        saveProgress(progress);
        console.log(`[40] indeed progress: ${progress.indeed}/${TARGET_EACH}`);

        if (progress.indeed >= TARGET_EACH) {
            break;
        }

        await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    const total = progress.linkedin + progress.indeed;
    console.log(`[40] DONE linkedin=${progress.linkedin} indeed=${progress.indeed} total=${total}`);
    console.log(`[40] Log: ${LOG_PATH}`);

    if (total < TARGET_EACH * 2) {
        process.exitCode = 1;
    }
}

await main();
