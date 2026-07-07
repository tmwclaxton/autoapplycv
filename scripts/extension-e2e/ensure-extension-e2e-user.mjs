#!/usr/bin/env node
/**
 * Ensure the Sanctum token user has a CV profile for ATS scoring in live E2E.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/linkedin-e2e-shared.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function runTinker(command) {
    const sail = join(ROOT, 'vendor/bin/sail');
    const runner = existsSync(sail)
        ? { bin: sail, args: ['artisan', 'tinker', '--execute', command] }
        : { bin: 'php', args: ['artisan', 'tinker', '--execute', command] };

    return spawnSync(runner.bin, runner.args, {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` },
    });
}

const env = { ...loadEnvFile(join(ROOT, '.env')), ...process.env };
const token = env.EXTENSION_E2E_TOKEN?.trim();

if (!token) {
    console.error('EXTENSION_E2E_TOKEN missing in .env');
    process.exit(1);
}

const escapedToken = JSON.stringify(token);
const command = [
    `$token = Laravel\\Sanctum\\PersonalAccessToken::findToken(${escapedToken});`,
    'if (!$token) { fwrite(STDERR, "token_not_found\\n"); exit(1); }',
    '$user = $token->tokenable;',
    'echo "token_user_id={$user->id}\\n";',
    '$profile = $user->cvProfile;',
    'if (!$profile) {',
    '    App\\Models\\CvProfile::factory()->for($user)->create([',
    '        "formatted_cv_text" => "Senior software engineer with 8 years PHP, Laravel, Vue, PostgreSQL, Redis, AWS. Led backend teams building APIs.",',
    '        "parsing_complete" => true,',
    '    ]);',
    '    echo "created_cv\\n";',
    '} elseif (trim((string)($profile->formatted_cv_text ?: $profile->summary)) === "") {',
    '    $profile->update([',
    '        "formatted_cv_text" => "Senior software engineer with 8 years PHP, Laravel, Vue, PostgreSQL, Redis, AWS.",',
    '        "parsing_complete" => true,',
    '    ]);',
    '    echo "updated_cv\\n";',
    '} else {',
    '    echo "has_cv\\n";',
    '}',
].join(' ');

const result = runTinker(command);
const output = `${result.stdout || ''}${result.stderr || ''}`.trim();

if (result.status !== 0) {
    console.error(output || 'Failed to ensure E2E user CV.');
    process.exit(result.status || 1);
}

console.log(output);
