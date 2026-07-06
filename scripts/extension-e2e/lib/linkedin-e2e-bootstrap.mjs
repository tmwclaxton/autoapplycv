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
    };
}
