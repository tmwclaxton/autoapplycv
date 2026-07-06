import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string[]} */
function getStagedFiles() {
    try {
        return execSync('git diff --cached --name-only --diff-filter=ACMR', {
            cwd: root,
            encoding: 'utf8',
        })
            .trim()
            .split('\n')
            .filter(Boolean);
    } catch {
        return [];
    }
}

/** @param {string} command @param {string} label */
function run(command, label) {
    console.log(`\n▶ ${label}`);

    execSync(command, { cwd: root, stdio: 'inherit' });
}

const staged = getStagedFiles();

if (staged.length === 0) {
    process.exit(0);
}

const needsEmDash = staged.some((file) => /\.(php|[cm]?js|vue|md|mdc)$/.test(file));

const needsFrontendChecks = staged.some(
    (file) =>
        /\.(vue|[cm]?js|tsx?)$/.test(file) ||
        file === 'eslint.config.js' ||
        file === 'tsconfig.json' ||
        file.startsWith('resources/'),
);

const needsPhpLint = staged.some((file) => file.endsWith('.php'));

try {
    if (needsEmDash) {
        run('npm run em-dash:check', 'Em dash check');
    }

    if (needsFrontendChecks) {
        run('npm run format:check', 'Prettier');
        run('npm run lint:check:ci', 'ESLint (CI mode, no Wayfinder output)');
    }

    if (needsPhpLint) {
        run('vendor/bin/pint --dirty --test --format agent', 'Pint');
    }
} catch {
    console.error('\nPre-commit checks failed. Fix the issues above and try again.');
    console.error('See .cursor/rules/pre-commit-quality.mdc for fixes.');
    process.exit(1);
}
