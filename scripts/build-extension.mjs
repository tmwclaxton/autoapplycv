#!/usr/bin/env node
/**
 * Build script for AutoCVApply browser extension.
 */
import {
    copyFileSync,
    cpSync,
    existsSync,
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
copyFileSync(join(SRC, 'shared/draft-all-stream.js'), join(DIST, 'draft-all-stream.js'));
copyFileSync(join(SRC, 'shared/form-frame-messaging.js'), join(DIST, 'form-frame-messaging.js'));
copyFileSync(join(SRC, 'background/index.js'), join(DIST, 'background.js'));
copyFileSync(join(SRC, 'content/form-heuristics.js'), join(DIST, 'form-heuristics.js'));
copyFileSync(join(SRC, 'content/focus-tracker.js'), join(DIST, 'focus-tracker.js'));
copyFileSync(join(SRC, 'content/portal-bar.js'), join(DIST, 'portal-bar.js'));
copyFileSync(join(SRC, 'content/index.js'), join(DIST, 'content.js'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.html'), join(DIST, 'sidepanel.html'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.css'), join(DIST, 'sidepanel.css'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.js'), join(DIST, 'sidepanel.js'));
copyFileSync(join(SRC, 'popup/popup.html'), join(DIST, 'popup.html'));
copyFileSync(join(SRC, 'popup/popup.css'), join(DIST, 'popup.css'));
copyFileSync(join(SRC, 'popup/popup.js'), join(DIST, 'popup.js'));

const iconsDir = join(ROOT, 'extension/icons');
const distIconsDir = join(DIST, 'icons');
const faviconSvg = join(ROOT, 'public/favicon.svg');
const requiredIcons = ['icon16.png', 'icon48.png', 'icon128.png'];

mkdirSync(iconsDir, { recursive: true });
mkdirSync(distIconsDir, { recursive: true });

function ensureExtensionIcons() {
    const missingIcons = requiredIcons.filter((icon) => !existsSync(join(iconsDir, icon)));

    if (missingIcons.length === 0) {
        return;
    }

    if (!existsSync(faviconSvg)) {
        throw new Error(
            `Missing extension icons (${missingIcons.join(', ')}). Add PNG files to extension/icons/ or provide public/favicon.svg to generate them.`,
        );
    }

    console.log(`  Generating missing extension icons from ${faviconSvg}...`);

    for (const icon of missingIcons) {
        const size = icon.match(/\d+/)?.[0];

        if (!size) {
            continue;
        }

        execSync(
            `npx --yes @resvg/resvg-js-cli --fit-width ${size} "${faviconSvg}" "${join(iconsDir, icon)}"`,
            { stdio: 'inherit' },
        );
    }

    const stillMissing = requiredIcons.filter((icon) => !existsSync(join(iconsDir, icon)));

    if (stillMissing.length > 0) {
        throw new Error(`Failed to generate extension icons: ${stillMissing.join(', ')}`);
    }
}

ensureExtensionIcons();
cpSync(iconsDir, distIconsDir, { recursive: true });

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
