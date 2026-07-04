import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env loader for maintenance scripts (no dotenv dependency).
 */
export function loadEnv(cwd = process.cwd()) {
    const path = resolve(cwd, '.env');

    try {
        const contents = readFileSync(path, 'utf8');

        for (const line of contents.split('\n')) {
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            const eq = trimmed.indexOf('=');

            if (eq === -1) {
                continue;
            }

            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();

            if (
                (value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    } catch {
        // .env optional when vars are exported in the shell
    }
}
