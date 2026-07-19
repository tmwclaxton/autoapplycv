import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './linkedin-e2e-shared.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export { loadEnvFile };

export function upsertEnvVar(filePath, key, value) {
    const quoted = `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const lines = existsSync(filePath) ? readFileSync(filePath, 'utf8').split('\n') : [];
    let found = false;

    const nextLines = lines.map((line) => {
        if (!line.startsWith(`${key}=`)) {
            return line;
        }

        found = true;

        return `${key}=${quoted}`;
    });

    if (!found) {
        nextLines.push(`${key}=${quoted}`);
    }

    writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/, '')}\n`);
}

export function resolveApiBase(env) {
    const raw = env.EXTENSION_E2E_API_BASE || env.APP_URL || 'http://localhost:8000';

    return raw.replace(/\/+$/, '');
}

export function tryGenerateExtensionToken() {
    const phpBin = spawnSync('which', ['php'], { encoding: 'utf8' }).stdout?.trim() || 'php';
    const sailBin = join(ROOT, 'vendor/bin/sail');
    const command = [
        'try {',
        '$user = App\\Models\\User::first();',
        'if (!$user) { $user = App\\Models\\User::factory()->create(["name" => "E2E User", "email" => "e2e@example.com"]); }',
        'echo $user->createToken("extension-e2e")->plainTextToken;',
        '} catch (Throwable $e) {',
        'fwrite(STDERR, $e->getMessage());',
        'exit(1);',
        '}',
    ].join(' ');

    const runners = [];

    if (existsSync(sailBin)) {
        runners.push({
            bin: sailBin,
            args: ['artisan', 'tinker', '--execute', command],
        });
    }

    runners.push({
        bin: phpBin,
        args: ['artisan', 'tinker', '--execute', command],
    });

    for (const runner of runners) {
        const result = spawnSync(runner.bin, runner.args, {
            cwd: ROOT,
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}`,
            },
        });

        const token = result.stdout?.trim();

        if (result.status === 0 && token && !token.includes('ERR:')) {
            return token;
        }
    }

    return null;
}

export function ensureExtensionConnection(env, envPath) {
    const apiBase = resolveApiBase(env);
    let token = env.EXTENSION_E2E_TOKEN?.trim() || '';
    let wroteEnv = false;

    if (!env.EXTENSION_E2E_API_BASE) {
        upsertEnvVar(envPath, 'EXTENSION_E2E_API_BASE', apiBase);
        env.EXTENSION_E2E_API_BASE = apiBase;
        wroteEnv = true;
    }

    if (!token) {
        token = tryGenerateExtensionToken();

        if (token) {
            upsertEnvVar(envPath, 'EXTENSION_E2E_TOKEN', token);
            env.EXTENSION_E2E_TOKEN = token;
            wroteEnv = true;
        }
    }

    return {
        apiBase,
        token,
        wroteEnv,
        connected: Boolean(apiBase && token),
    };
}

export async function getServiceWorker(context) {
    const existing = context.serviceWorkers()[0];

    if (existing) {
        return existing;
    }

    return context.waitForEvent('serviceworker', { timeout: 60_000 });
}

export async function findLinkedInPage(context) {
    const pages = context.pages().filter((entry) => entry.url().includes('linkedin.com'));

    return pages.find((entry) => entry.url().includes('/jobs')) || pages.at(-1) || context.pages()[0];
}

export function parseRoleList(raw) {
    return String(raw || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function readArgValue(argv, prefix) {
    const arg = argv.find((entry) => entry.startsWith(prefix));

    if (!arg) {
        return '';
    }

    return arg.slice(prefix.length);
}

/**
 * @param {string[]} argv
 * @returns {{
 *   filters: import('../../../extension/src/shared/linkedin-platform.js').LinkedInSearchFilters|null,
 *   fitCheckEnabled: boolean,
 *   minFitScore: number,
 * }}
 */
export function parseAutoApplyRunOptions(argv) {
    /** @type {import('../../../extension/src/shared/linkedin-platform.js').LinkedInSearchFilters} */
    const filters = {};
    const location = readArgValue(argv, '--location=').trim();

    if (location) {
        filters.location = location;
    }

    const workType = readArgValue(argv, '--work-type=').trim();

    if (workType) {
        filters.workType = workType;
    }

    const experience = readArgValue(argv, '--experience=').trim();

    if (experience) {
        filters.experience = experience;
    }

    const datePosted = readArgValue(argv, '--date-posted=').trim();

    if (datePosted) {
        filters.datePosted = datePosted;
    }

    const minSalaryUk = readArgValue(argv, '--min-salary=').trim();

    if (minSalaryUk) {
        filters.minSalaryUk = minSalaryUk;
    }

    const fitCheckArg = readArgValue(argv, '--fit-check=').trim().toLowerCase();
    const fitCheckEnabled = fitCheckArg !== 'off' && fitCheckArg !== 'false';
    const minFitScoreRaw = readArgValue(argv, '--min-fit-score=');
    const parsedMinFitScore = minFitScoreRaw ? Number.parseInt(minFitScoreRaw, 10) : 60;

    return {
        filters: Object.keys(filters).length ? filters : null,
        fitCheckEnabled,
        minFitScore: Number.isNaN(parsedMinFitScore) ? 60 : parsedMinFitScore,
    };
}

export function validateLinkedInSearchUrl(urlString, filters) {
    const parsed = new URL(urlString);
    const issues = [];

    if (!parsed.pathname.startsWith('/jobs/search')) {
        issues.push('expected LinkedIn jobs search path');
    }

    if (!filters) {
        return { ok: issues.length === 0, issues, url: urlString };
    }

    if (filters.location && parsed.searchParams.get('location') !== filters.location) {
        issues.push(`location expected "${filters.location}" got "${parsed.searchParams.get('location') || ''}"`);
    }

    const workTypeMap = { remote: '2', hybrid: '3', on_site: '1' };

    if (filters.workType && parsed.searchParams.get('f_WT') !== workTypeMap[filters.workType]) {
        issues.push(`f_WT expected "${workTypeMap[filters.workType]}" got "${parsed.searchParams.get('f_WT') || ''}"`);
    }

    const experienceMap = {
        entry: '2',
        associate: '3',
        mid_senior: '4',
        director: '5',
        executive: '6',
    };

    if (filters.experience && parsed.searchParams.get('f_E') !== experienceMap[filters.experience]) {
        issues.push(`f_E expected "${experienceMap[filters.experience]}" got "${parsed.searchParams.get('f_E') || ''}"`);
    }

    const datePostedMap = {
        '24h': 'r86400',
        week: 'r604800',
        month: 'r2592000',
    };

    if (filters.datePosted && parsed.searchParams.get('f_TPR') !== datePostedMap[filters.datePosted]) {
        issues.push(`f_TPR expected "${datePostedMap[filters.datePosted]}" got "${parsed.searchParams.get('f_TPR') || ''}"`);
    }

    const salaryMap = {
        '40k': '1',
        '50k': '2',
        '60k': '3',
        '80k': '4',
        '100k': '5',
    };

    if (filters.minSalaryUk && parsed.searchParams.get('f_SB2') !== salaryMap[filters.minSalaryUk]) {
        issues.push(`f_SB2 expected "${salaryMap[filters.minSalaryUk]}" got "${parsed.searchParams.get('f_SB2') || ''}"`);
    }

    return { ok: issues.length === 0, issues, url: urlString };
}

export function findFitGateLogEntry(log = []) {
    return log.find((entry) => /Scored .+ - \d+\/100|Skipped .+ fit \d+\/100|too short to score fit|Fit score unavailable - continuing apply/i.test(entry.message || '')) || null;
}

export function findAtsFitScoreLogEntry(log = []) {
    return log.find((entry) => /Scored .+ - \d+\/100|Skipped .+ fit \d+\/100/i.test(entry.message || '')) || null;
}

export function findFitPassedAndApplyingLogEntry(log = []) {
    return log.find((entry) => /Scored .+ - \d+\/100 - applying/i.test(entry.message || '')) || null;
}

export function findEasyApplyProgressLogEntry(log = []) {
    return log.find((entry) => /\[submitted\]|\[advance\]|Draft All|Applied to /i.test(entry.message || '')) || null;
}

export function findLinkedInSearchLogEntry(log = []) {
    const entry = log.find((item) => String(item.message || '').startsWith('LinkedIn search:'));

    if (!entry) {
        return null;
    }

    return String(entry.message).replace(/^LinkedIn search:\s*/, '').trim();
}

export function parseFullFlowArgs(argv) {
    const maxJobsArg = argv.find((arg) => arg.startsWith('--max-jobs=') || arg.startsWith('--max-applications='));
    const rolesArg = argv.find((arg) => arg.startsWith('--roles='));
    const roleArg = argv.find((arg) => arg.startsWith('--role='));
    const outputDirArg = argv.find((arg) => arg.startsWith('--output-dir='));

    const roleDescription = rolesArg
        ? parseRoleList(rolesArg.split('=').slice(1).join('=')).join(' ')
        : roleArg
            ? roleArg.split('=').slice(1).join('=').trim()
            : 'software engineer remote UK';

    return {
        maxJobs: maxJobsArg ? Number.parseInt(maxJobsArg.split('=')[1], 10) : 3,
        roleDescription,
        headless: argv.includes('--headless'),
        clearProfile: argv.includes('--clear-profile'),
        outputDir: outputDirArg
            ? outputDirArg.split('=').slice(1).join('=')
            : join(ROOT, 'tests/output/linkedin-auto-apply-full-flow'),
        ...parseAutoApplyRunOptions(argv),
    };
}
