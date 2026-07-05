#!/usr/bin/env node
/**
 * Build script for AutoCVApply browser extension.
 */
import { execSync } from 'child_process';
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'extension/src');
const DIST = join(ROOT, 'extension/dist');
const OUTPUT_DIR = join(ROOT, 'public/extension');

const CHROME_ZIP = join(OUTPUT_DIR, 'autoapplycv-chrome.zip');
const FIREFOX_ZIP = join(OUTPUT_DIR, 'autoapplycv-firefox.zip');
const LEGACY_ZIP = join(OUTPUT_DIR, 'autoapplycv.zip');

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) {
        return {};
    }

    const values = {};

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
        const trimmed = line.trim();

        if (trimmed === '' || trimmed.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');

        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}

function resolveExtensionApiBase(env) {
    const raw = env.EXTENSION_API_BASE || env.APP_URL || 'https://autocvapply.com';

    return raw.replace(/\/+$/, '');
}

function hostPermissionForApiBase(apiBase) {
    const url = new URL(`${apiBase}/`);

    return `${url.origin}/*`;
}

function collectExportNames(content) {
    const names = new Set();

    for (const match of content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
        names.add(match[1]);
    }

    for (const match of content.matchAll(/export\s+(?:const|let|var|class)\s+(\w+)/g)) {
        names.add(match[1]);
    }

    for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const part of match[1].split(',')) {
            const trimmed = part.trim();

            if (!trimmed) {
                continue;
            }

            const exportName = trimmed.includes(' as ')
                ? trimmed.split(/\s+as\s+/)[1].trim()
                : trimmed.split(/\s+/)[0];

            names.add(exportName);
        }
    }

    return names;
}

function collectNamedImports(content) {
    const imports = [];

    for (const match of content.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.\/[^'"]+)['"]/g)) {
        const names = match[1]
            .split(',')
            .map((part) => {
                const trimmed = part.trim();

                if (!trimmed) {
                    return null;
                }

                return trimmed.includes(' as ')
                    ? trimmed.split(/\s+as\s+/)[0].trim()
                    : trimmed.split(/\s+/)[0];
            })
            .filter(Boolean);

        imports.push({ names, from: match[2] });
    }

    return imports;
}

function verifyDistImports() {
    const jsFiles = readdirSync(DIST).filter((file) => file.endsWith('.js'));
    const exportCache = new Map();

    for (const file of jsFiles) {
        const content = readFileSync(join(DIST, file), 'utf8');

        if (/\.\.\/shared\//.test(content)) {
            throw new Error(
                `${file} imports from ../shared/. Copy shared modules to dist root and use ./ paths.`,
            );
        }

        for (const match of content.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
            const importedPath = join(DIST, match[1]);

            if (!existsSync(importedPath)) {
                throw new Error(`${file} imports missing dist file: ${match[1]}`);
            }
        }

        for (const { names, from } of collectNamedImports(content)) {
            const importedPath = join(DIST, from);

            if (!exportCache.has(importedPath)) {
                exportCache.set(importedPath, collectExportNames(readFileSync(importedPath, 'utf8')));
            }

            const exports = exportCache.get(importedPath);

            for (const name of names) {
                if (!exports.has(name)) {
                    throw new Error(
                        `${file} imports "${name}" from ${from}, but that export is missing in dist.`,
                    );
                }
            }
        }
    }
}

function patchManifest(apiBase) {
    const manifestPath = join(DIST, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const apiOriginPattern = hostPermissionForApiBase(apiBase);
    const excludeMatches = new Set(manifest.content_scripts?.[0]?.exclude_matches || []);

    excludeMatches.add(apiOriginPattern);

    manifest.host_permissions = ['<all_urls>'];

    const connectableMatches = new Set(manifest.externally_connectable?.matches || [
        'https://autocvapply.com/*',
        'http://localhost/*',
        'http://127.0.0.1/*',
    ]);

    connectableMatches.add(apiOriginPattern);

    manifest.externally_connectable = {
        matches: [...connectableMatches],
    };

    for (const script of manifest.content_scripts || []) {
        script.matches = ['<all_urls>'];
        script.exclude_matches = [...excludeMatches];
    }

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
}

const env = loadEnvFile(join(ROOT, '.env'));
const apiBase = resolveExtensionApiBase(env);

console.log('Building AutoCVApply extension...');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

copyFileSync(join(ROOT, 'extension/manifest.json'), join(DIST, 'manifest.json'));
copyFileSync(join(SRC, 'shared/profile-value-polish.js'), join(DIST, 'profile-value-polish.js'));
copyFileSync(join(SRC, 'shared/draft-all-stream.js'), join(DIST, 'draft-all-stream.js'));
copyFileSync(join(SRC, 'shared/connection.js'), join(DIST, 'connection.js'));
copyFileSync(join(SRC, 'shared/application-settings.js'), join(DIST, 'application-settings.js'));
copyFileSync(join(SRC, 'shared/postbox-theme.css'), join(DIST, 'postbox-theme.css'));
copyFileSync(join(SRC, 'shared/form-frame-messaging.js'), join(DIST, 'form-frame-messaging.js'));
copyFileSync(join(SRC, 'shared/file-transfer.js'), join(DIST, 'file-transfer.js'));
copyFileSync(join(SRC, 'shared/debug-log.js'), join(DIST, 'debug-log.js'));
copyFileSync(join(SRC, 'shared/debug-log-client.js'), join(DIST, 'debug-log-client.js'));
copyFileSync(join(SRC, 'shared/perf-timer.js'), join(DIST, 'perf-timer.js'));
copyFileSync(join(SRC, 'shared/draft-all-optimizations.js'), join(DIST, 'draft-all-optimizations.js'));
copyFileSync(join(SRC, 'shared/pending-fields.js'), join(DIST, 'pending-fields.js'));
copyFileSync(join(SRC, 'shared/page-capture.js'), join(DIST, 'page-capture.js'));
copyFileSync(join(SRC, 'shared/draft-batch-chat.js'), join(DIST, 'draft-batch-chat.js'));
copyFileSync(join(SRC, 'shared/upload-validation.js'), join(DIST, 'upload-validation.js'));
copyFileSync(join(SRC, 'shared/side-panel-state.js'), join(DIST, 'side-panel-state.js'));
copyFileSync(join(SRC, 'debug/debug.html'), join(DIST, 'debug.html'));
copyFileSync(join(SRC, 'debug/debug.js'), join(DIST, 'debug.js'));
copyFileSync(join(SRC, 'background/index.js'), join(DIST, 'background.js'));
copyFileSync(join(SRC, 'content/form-content-signature.js'), join(DIST, 'form-content-signature.js'));
copyFileSync(join(SRC, 'content/form-heuristics.js'), join(DIST, 'form-heuristics.js'));
copyFileSync(join(SRC, 'content/field-inventory.js'), join(DIST, 'field-inventory.js'));
copyFileSync(join(SRC, 'content/focus-tracker.js'), join(DIST, 'focus-tracker.js'));
copyFileSync(join(SRC, 'content/field-highlighter.js'), join(DIST, 'field-highlighter.js'));
copyFileSync(join(SRC, 'content/portal-bar.js'), join(DIST, 'portal-bar.js'));
copyFileSync(join(SRC, 'content/index.js'), join(DIST, 'content.js'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.html'), join(DIST, 'sidepanel.html'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.css'), join(DIST, 'sidepanel.css'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.js'), join(DIST, 'sidepanel.js'));
copyFileSync(join(SRC, 'sidepanel/assist.js'), join(DIST, 'assist.js'));
copyFileSync(join(SRC, 'sidepanel/documents.js'), join(DIST, 'documents.js'));
copyFileSync(join(SRC, 'sidepanel/pending-fields.js'), join(DIST, 'pending-fields-panel.js'));

patchManifest(apiBase);
verifyDistImports();

const iconsDir = join(ROOT, 'extension/icons');
const distIconsDir = join(DIST, 'icons');
const faviconSvg = join(ROOT, 'public/favicon.svg');
const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

mkdirSync(iconsDir, { recursive: true });
mkdirSync(distIconsDir, { recursive: true });

function ensureExtensionIcons() {
    if (!existsSync(faviconSvg)) {
        const missingIcons = requiredIcons.filter((icon) => !existsSync(join(iconsDir, icon)));

        if (missingIcons.length > 0) {
            throw new Error(
                `Missing extension icons (${missingIcons.join(', ')}). Add PNG files to extension/icons/ or provide public/favicon.svg to generate them.`,
            );
        }

        return;
    }

    console.log(`  Generating extension icons from ${faviconSvg}...`);

    for (const icon of requiredIcons) {
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

const missingDistIcons = requiredIcons.filter((icon) => !existsSync(join(distIconsDir, icon)));

if (missingDistIcons.length > 0) {
    throw new Error(`Extension build is missing icons in dist: ${missingDistIcons.join(', ')}`);
}

function embedSidepanelIcon() {
    const sidepanelHtmlPath = join(DIST, 'sidepanel.html');
    const icon48Path = join(distIconsDir, 'icon48.png');
    const iconBuffer = readFileSync(icon48Path);
    const iconDataUri = `data:image/png;base64,${iconBuffer.toString('base64')}`;
    let html = readFileSync(sidepanelHtmlPath, 'utf8');

    html = html.replace(
        '<img class="shell-mark"',
        `<img src="${iconDataUri}" class="shell-mark"`,
    );

    writeFileSync(sidepanelHtmlPath, html);
}

embedSidepanelIcon();

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
    manifest.sidebar_action = {
        default_panel: 'sidepanel.html',
        default_title: 'AutoCVApply',
    };
    delete manifest.action?.default_popup;
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
