import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wayfinderDirs = ['resources/js/routes', 'resources/js/actions'];

for (const dir of wayfinderDirs) {
    rmSync(path.join(root, dir), { recursive: true, force: true });
}

let lintExitCode = 0;

try {
    execSync('npm run lint:check', { cwd: root, stdio: 'inherit' });
} catch {
    lintExitCode = 1;
} finally {
    execSync('php artisan wayfinder:generate --no-interaction', {
        cwd: root,
        stdio: 'inherit',
    });
}

process.exit(lintExitCode);
