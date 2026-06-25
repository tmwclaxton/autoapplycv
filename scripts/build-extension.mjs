#!/usr/bin/env node
/**
 * Build script for AutoCVApply browser extension.
 */
import {
    copyFileSync,
    cpSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'extension/src');
const DIST = join(ROOT, 'extension/dist');
const OUTPUT_DIR = join(ROOT, 'public/extension');

const CHROME_ZIP = join(OUTPUT_DIR, 'autoapplycv-chrome.zip');
const FIREFOX_ZIP = join(OUTPUT_DIR, 'autoapplycv-firefox.zip');
const LEGACY_ZIP = join(OUTPUT_DIR, 'autoapplycv.zip');

console.log('Building AutoCVApply extension...');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

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

function zipDirectory(sourceDir, outputPath) {
    rmSync(outputPath, { force: true });
    execSync(`cd "${sourceDir}" && zip -qr "${outputPath}" .`, { stdio: 'inherit' });
}

function buildFirefoxDist() {
    const firefoxDist = join(ROOT, 'extension/dist-firefox');
    rmSync(firefoxDist, { recursive: true, force: true });
    cpSync(DIST, firefoxDist, { recursive: true });

    const manifestPath = join(firefoxDist, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.browser_specific_settings = {
        gecko: {
            id: 'autocvapply@autocvapply.com',
            strict_min_version: '109.0',
        },
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

    return firefoxDist;
}

zipDirectory(DIST, CHROME_ZIP);
copyFileSync(CHROME_ZIP, LEGACY_ZIP);

const firefoxDist = buildFirefoxDist();
zipDirectory(firefoxDist, FIREFOX_ZIP);
rmSync(firefoxDist, { recursive: true, force: true });

console.log(`Extension built to ${DIST}/`);
console.log(`  Chrome zip:  ${CHROME_ZIP}`);
console.log(`  Firefox zip: ${FIREFOX_ZIP}`);
