#!/usr/bin/env node
/**
 * Generate favicon.ico and apple-touch-icon.png from public/favicon.svg
 */
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const svg = join(publicDir, 'favicon.svg');
const tmpDir = join(root, 'node_modules/.cache/favicons');

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const pngSizes = [16, 32, 48];
const pngPaths = [];

for (const size of pngSizes) {
    const out = join(tmpDir, `${size}.png`);
    execSync(
        `npx --yes @resvg/resvg-js-cli --fit-width ${size} "${svg}" "${out}"`,
        { stdio: 'inherit', cwd: root },
    );
    pngPaths.push(out);
}

const appleTouch = join(publicDir, 'apple-touch-icon.png');
execSync(
    `npx --yes @resvg/resvg-js-cli --fit-width 180 "${svg}" "${appleTouch}"`,
    { stdio: 'inherit', cwd: root },
);

const icoOut = join(publicDir, 'favicon.ico');
execSync(
    `node --input-type=module -e "import pngToIco from 'png-to-ico'; import { writeFileSync } from 'node:fs'; const buf = await pngToIco(${JSON.stringify(pngPaths)}); writeFileSync('${icoOut}', buf); console.log('wrote favicon.ico', buf.length, 'bytes');"`,
    { stdio: 'inherit', cwd: root },
);

console.log('Favicons generated in public/');
