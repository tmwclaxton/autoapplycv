#!/usr/bin/env node
/**
 * Run Auto Apply marathon on every supported platform (10 applications each by default).
 *
 * Usage:
 *   node scripts/extension-test/auto-apply-all-platforms.mjs
 *   node scripts/extension-test/auto-apply-all-platforms.mjs --target=5 --platforms=reed,simplyhired
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MARATHON = join(ROOT, 'scripts/extension-test/auto-apply-marathon.mjs');
const PROGRESS_PATH = '/tmp/auto-apply-all-platforms-progress.json';
const SUMMARY_PATH = join(ROOT, 'tests/fixtures/form-extraction/auto-apply-all-platforms-report.json');

const ALL_PLATFORMS = ['linkedin', 'indeed', 'totaljobs', 'glassdoor', 'reed', 'simplyhired', 'cvlibrary'];

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');

        return [key, value ?? 'true'];
    }),
);

const TARGET = Number(args.target || 10);
const INSTANCE_ID = args.instance || process.env.EXTENSION_BRIDGE_INSTANCE_ID || null;
const ROLE = args.role || 'software engineer';
const MIN_FIT = Number(args['min-fit'] || 10);
const PLATFORMS = (args.platforms || ALL_PLATFORMS.join(','))
    .split(',')
    .map((platform) => platform.trim())
    .filter((platform) => ALL_PLATFORMS.includes(platform));

function loadProgress() {
    if (!existsSync(PROGRESS_PATH)) {
        return Object.fromEntries(PLATFORMS.map((platform) => [platform, 0]));
    }

    try {
        const saved = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));

        return Object.fromEntries(PLATFORMS.map((platform) => [platform, Number(saved[platform] || 0)]));
    } catch {
        return Object.fromEntries(PLATFORMS.map((platform) => [platform, 0]));
    }
}

function saveProgress(progress) {
    writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

function platformArgs(platform) {
    const marathonArgs = [
        MARATHON,
        `--platform=${platform}`,
        `--target=${TARGET}`,
        `--role=${ROLE}`,
        `--min-fit=${MIN_FIT}`,
        '--fit=1',
        '--timeout=21600000',
    ];

    if (platform === 'linkedin') {
        marathonArgs.push('--location=United Kingdom', '--work-type=remote');
    } else {
        marathonArgs.push('--location=London');
    }

    return marathonArgs;
}

function runMarathon(platform) {
    return new Promise((resolve, reject) => {
        console.log(`[all-platforms] starting ${platform} (target ${TARGET}, min fit ${MIN_FIT})`);

        const child = spawn(process.execPath, platformArgs(platform), {
            cwd: ROOT,
            stdio: 'inherit',
            env: {
                ...process.env,
                ...(INSTANCE_ID ? { EXTENSION_BRIDGE_INSTANCE_ID: INSTANCE_ID } : {}),
            },
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

async function readReport(platform) {
    const reportPath = join(ROOT, 'tests/fixtures/form-extraction/auto-apply-marathon-report.json');

    if (!existsSync(reportPath)) {
        return null;
    }

    try {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'));

        if (report.platform !== platform) {
            return null;
        }

        return report;
    } catch {
        return null;
    }
}

async function main() {
    const bridge = await fetch('http://127.0.0.1:7433/status').then((response) => response.json()).catch(() => null);

    if (!bridge?.extensionConnected) {
        throw new Error('Extension bridge not connected. Run: npm run extension-bridge');
    }

    if (INSTANCE_ID) {
        const match = bridge.instances?.find((instance) => instance.instanceId === INSTANCE_ID);

        if (!match) {
            throw new Error(
                `Extension instance "${INSTANCE_ID}" is not connected. `
                + `Connected: ${(bridge.instances || []).map((instance) => instance.instanceId).join(', ') || 'none'}`,
            );
        }

        console.log(`[all-platforms] using bridge instance ${INSTANCE_ID}`);
    } else if ((bridge.instanceCount || 0) > 1) {
        throw new Error(
            `Multiple extension instances connected (${bridge.instanceCount}). `
            + 'Pass --instance=<id> or set EXTENSION_BRIDGE_INSTANCE_ID.',
        );
    }

    const progress = loadProgress();
    const summary = {
        startedAt: new Date().toISOString(),
        targetPerPlatform: TARGET,
        minFitScore: MIN_FIT,
        role: ROLE,
        platforms: {},
    };

    for (const platform of PLATFORMS) {
        while (progress[platform] < TARGET) {
            const need = TARGET - progress[platform];

            try {
                await runMarathon(platform);
            } catch (error) {
                console.warn(`[all-platforms] ${platform} run ended: ${error.message}`);
            }

            const report = await readReport(platform);
            const batchApplied = Number(report?.totals?.applied || 0);
            progress[platform] = Math.min(TARGET, progress[platform] + batchApplied);
            saveProgress(progress);

            summary.platforms[platform] = {
                applied: progress[platform],
                target: TARGET,
                lastReport: report,
            };

            writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
            console.log(`[all-platforms] ${platform}: ${progress[platform]}/${TARGET} applied`);

            if (progress[platform] >= TARGET) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 8000));
        }
    }

    summary.finishedAt = new Date().toISOString();
    summary.success = PLATFORMS.every((platform) => progress[platform] >= TARGET);
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);

    console.log('[all-platforms] final progress:', progress);
    console.log(`[all-platforms] summary: ${SUMMARY_PATH}`);

    if (!summary.success) {
        process.exitCode = 1;
    }
}

await main();
