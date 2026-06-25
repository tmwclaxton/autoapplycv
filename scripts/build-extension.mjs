#!/usr/bin/env node
/**
 * Build script for AutoCVApply browser extension.
 */
import { copyFileSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'extension/src');
const DIST = join(ROOT, 'extension/dist');

console.log('Building AutoCVApply extension...');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

copyFileSync(join(ROOT, 'extension/manifest.json'), join(DIST, 'manifest.json'));
copyFileSync(join(SRC, 'background/index.js'), join(DIST, 'background.js'));
copyFileSync(join(SRC, 'content/index.js'), join(DIST, 'content.js'));
copyFileSync(join(SRC, 'content/linkedin-easy-apply.js'), join(DIST, 'linkedin-easy-apply.js'));
copyFileSync(join(SRC, 'popup/popup.html'), join(DIST, 'popup.html'));
copyFileSync(join(SRC, 'popup/popup.css'), join(DIST, 'popup.css'));
copyFileSync(join(SRC, 'popup/popup.js'), join(DIST, 'popup.js'));

const iconsDir = join(ROOT, 'extension/icons');
const distIconsDir = join(DIST, 'icons');
mkdirSync(distIconsDir, { recursive: true });

try {
    cpSync(iconsDir, distIconsDir, { recursive: true });
} catch {
    console.log('  Note: No icons found. Add icon16.png, icon48.png, icon128.png to extension/icons/');
}

console.log('Extension built to extension/dist/');
