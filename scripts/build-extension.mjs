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
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}

function resolveExtensionApiBase(env) {
    const raw =
        env.EXTENSION_API_BASE || env.APP_URL || 'https://autocvapply.com';

    return raw.replace(/\/+$/, '');
}

function hostPermissionForApiBase(apiBase) {
    const url = new URL(`${apiBase}/`);

    return `${url.origin}/*`;
}

function collectExportNames(content) {
    const names = new Set();

    for (const match of content.matchAll(
        /export\s+(?:async\s+)?function\s+(\w+)/g,
    )) {
        names.add(match[1]);
    }

    for (const match of content.matchAll(
        /export\s+(?:const|let|var|class)\s+(\w+)/g,
    )) {
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

    for (const match of content.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*['"](\.\/[^'"]+)['"]/g,
    )) {
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
                throw new Error(
                    `${file} imports missing dist file: ${match[1]}`,
                );
            }
        }

        for (const { names, from } of collectNamedImports(content)) {
            const importedPath = join(DIST, from);

            if (!exportCache.has(importedPath)) {
                exportCache.set(
                    importedPath,
                    collectExportNames(readFileSync(importedPath, 'utf8')),
                );
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
    const excludeMatches = new Set(
        manifest.content_scripts?.[0]?.exclude_matches || [],
    );

    excludeMatches.add(apiOriginPattern);

    manifest.host_permissions = ['<all_urls>'];

    const connectableMatches = new Set(
        manifest.externally_connectable?.matches || [
            'https://autocvapply.com/*',
            'http://localhost/*',
            'http://127.0.0.1/*',
        ],
    );

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

function removeDirForce(dirPath) {
    rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

const env = loadEnvFile(join(ROOT, '.env'));
const apiBase = resolveExtensionApiBase(env);

console.log('Building AutoCVApply extension...');

removeDirForce(DIST);
mkdirSync(DIST, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

copyFileSync(
    join(ROOT, 'extension/manifest.json'),
    join(DIST, 'manifest.json'),
);
copyFileSync(
    join(SRC, 'shared/answer-normalization.js'),
    join(DIST, 'answer-normalization.js'),
);
copyFileSync(
    join(SRC, 'shared/clarifying-fill.js'),
    join(DIST, 'clarifying-fill.js'),
);
copyFileSync(
    join(SRC, 'shared/profile-value-polish.js'),
    join(DIST, 'profile-value-polish.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-all-stream.js'),
    join(DIST, 'draft-all-stream.js'),
);
copyFileSync(join(SRC, 'shared/connection.js'), join(DIST, 'connection.js'));
copyFileSync(
    join(SRC, 'shared/application-settings.js'),
    join(DIST, 'application-settings.js'),
);
copyFileSync(
    join(SRC, 'shared/postbox-theme.css'),
    join(DIST, 'postbox-theme.css'),
);
copyFileSync(
    join(SRC, 'shared/form-frame-messaging.js'),
    join(DIST, 'form-frame-messaging.js'),
);
copyFileSync(
    join(SRC, 'shared/file-transfer.js'),
    join(DIST, 'file-transfer.js'),
);
copyFileSync(
    join(SRC, 'shared/cover-letter-pdf.js'),
    join(DIST, 'cover-letter-pdf.js'),
);
copyFileSync(
    join(SRC, 'shared/cover-letter-pdf-metrics.js'),
    join(DIST, 'cover-letter-pdf-metrics.js'),
);
copyFileSync(
    join(SRC, 'shared/cover-letter-draft.js'),
    join(DIST, 'cover-letter-draft.js'),
);
copyFileSync(
    join(SRC, 'shared/cover-letter-attach.js'),
    join(DIST, 'cover-letter-attach.js'),
);
copyFileSync(
    join(SRC, 'shared/cover-letter-designs.js'),
    join(DIST, 'cover-letter-designs.js'),
);
copyFileSync(
    join(SRC, 'shared/pdf-win-ansi.js'),
    join(DIST, 'pdf-win-ansi.js'),
);
copyFileSync(
    join(SRC, 'shared/extension-context.js'),
    join(DIST, 'extension-context.js'),
);
copyFileSync(join(SRC, 'shared/debug-log.js'), join(DIST, 'debug-log.js'));
copyFileSync(
    join(SRC, 'shared/debug-log-client.js'),
    join(DIST, 'debug-log-client.js'),
);
copyFileSync(join(SRC, 'shared/perf-timer.js'), join(DIST, 'perf-timer.js'));
copyFileSync(
    join(SRC, 'shared/draft-all-optimizations.js'),
    join(DIST, 'draft-all-optimizations.js'),
);
copyFileSync(
    join(SRC, 'shared/speak-language-answer.js'),
    join(DIST, 'speak-language-answer.js'),
);
mkdirSync(join(DIST, 'draft-all'), { recursive: true });
copyFileSync(
    join(SRC, 'shared/draft-all/answer-utils.js'),
    join(DIST, 'draft-all/answer-utils.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-all/consent-fields.js'),
    join(DIST, 'draft-all/consent-fields.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-all/empty-batch-retry.js'),
    join(DIST, 'draft-all/empty-batch-retry.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-all/type-coherence.js'),
    join(DIST, 'draft-all/type-coherence.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-all/answer-vet.js'),
    join(DIST, 'draft-all/answer-vet.js'),
);
writeFileSync(
    join(DIST, 'draft-all-pipeline.js'),
    readFileSync(join(SRC, 'shared/draft-all/pipeline.js'), 'utf8')
        .replace(
            "from './answer-utils.js'",
            "from './draft-all/answer-utils.js'",
        )
        .replace(
            "from './consent-fields.js'",
            "from './draft-all/consent-fields.js'",
        )
        .replace(
            "from './type-coherence.js'",
            "from './draft-all/type-coherence.js'",
        )
        .replace(
            "from '../auto-apply-screener-answer.js'",
            "from './auto-apply-screener-answer.js'",
        )
        .replace(
            "from '../draft-all-optimizations.js'",
            "from './draft-all-optimizations.js'",
        )
        .replace(
            "from '../pending-fields.js'",
            "from './pending-fields.js'",
        ),
);
copyFileSync(
    join(SRC, 'shared/pending-fields.js'),
    join(DIST, 'pending-fields.js'),
);
copyFileSync(
    join(SRC, 'shared/bridge-client.js'),
    join(DIST, 'bridge-client.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-batch-chat.js'),
    join(DIST, 'draft-batch-chat.js'),
);
copyFileSync(
    join(SRC, 'shared/upload-validation.js'),
    join(DIST, 'upload-validation.js'),
);
copyFileSync(
    join(SRC, 'shared/side-panel-state.js'),
    join(DIST, 'side-panel-state.js'),
);
copyFileSync(
    join(SRC, 'shared/side-panel-host-tab.js'),
    join(DIST, 'side-panel-host-tab.js'),
);
copyFileSync(
    join(SRC, 'shared/browser-panel.js'),
    join(DIST, 'browser-panel.js'),
);
copyFileSync(
    join(SRC, 'shared/job-board-market.js'),
    join(DIST, 'job-board-market.js'),
);
copyFileSync(
    join(SRC, 'shared/linkedin-platform.js'),
    join(DIST, 'linkedin-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/indeed-platform.js'),
    join(DIST, 'indeed-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/totaljobs-platform.js'),
    join(DIST, 'totaljobs-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/reed-platform.js'),
    join(DIST, 'reed-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/cv-library-platform.js'),
    join(DIST, 'cv-library-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/totaljobs-auto-apply-runner.js'),
    join(DIST, 'totaljobs-auto-apply-runner.js'),
);
copyFileSync(
    join(SRC, 'shared/glassdoor-platform.js'),
    join(DIST, 'glassdoor-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/glassdoor-auto-apply-runner.js'),
    join(DIST, 'glassdoor-auto-apply-runner.js'),
);
copyFileSync(
    join(SRC, 'shared/simplyhired-platform.js'),
    join(DIST, 'simplyhired-platform.js'),
);
copyFileSync(
    join(SRC, 'shared/simplyhired-auto-apply-runner.js'),
    join(DIST, 'simplyhired-auto-apply-runner.js'),
);
copyFileSync(
    join(SRC, 'shared/simplyhired-orchestrator.js'),
    join(DIST, 'simplyhired-orchestrator.js'),
);
copyFileSync(
    join(SRC, 'shared/reed-auto-apply-runner.js'),
    join(DIST, 'reed-auto-apply-runner.js'),
);
copyFileSync(
    join(SRC, 'shared/cv-library-auto-apply-runner.js'),
    join(DIST, 'cv-library-auto-apply-runner.js'),
);
copyFileSync(
    join(SRC, 'shared/cv-library-orchestrator.js'),
    join(DIST, 'cv-library-orchestrator.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-fit.js'),
    join(DIST, 'auto-apply-fit.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-role.js'),
    join(DIST, 'auto-apply-role.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-start-filters.js'),
    join(DIST, 'auto-apply-start-filters.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-platforms.js'),
    join(DIST, 'auto-apply-platforms.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-session.js'),
    join(DIST, 'auto-apply-session.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-run-ownership.js'),
    join(DIST, 'auto-apply-run-ownership.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-timing.js'),
    join(DIST, 'auto-apply-timing.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-timing-content.js'),
    join(DIST, 'auto-apply-timing-content.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-window.js'),
    join(DIST, 'auto-apply-window.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-activity-ui.js'),
    join(DIST, 'auto-apply-activity-ui.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-controls-ui.js'),
    join(DIST, 'auto-apply-controls-ui.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-pause-ui.js'),
    join(DIST, 'auto-apply-pause-ui.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-captcha-alert.js'),
    join(DIST, 'auto-apply-captcha-alert.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-intervention.js'),
    join(DIST, 'auto-apply-intervention.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-outcomes.js'),
    join(DIST, 'auto-apply-outcomes.js'),
);
copyFileSync(
    join(SRC, 'shared/draft-all-step-timeout.js'),
    join(DIST, 'draft-all-step-timeout.js'),
);
copyFileSync(
    join(SRC, 'shared/linkedin-step-readiness.js'),
    join(DIST, 'linkedin-step-readiness.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-blockers.js'),
    join(DIST, 'auto-apply-blockers.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-screener-answer.js'),
    join(DIST, 'auto-apply-screener-answer.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-analytics.js'),
    join(DIST, 'auto-apply-analytics.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-orchestrator.js'),
    join(DIST, 'auto-apply-orchestrator.js'),
);
copyFileSync(
    join(SRC, 'shared/auto-apply-blockers.js'),
    join(DIST, 'auto-apply-blockers.js'),
);
copyFileSync(join(SRC, 'debug/debug.html'), join(DIST, 'debug.html'));
copyFileSync(join(SRC, 'debug/debug.js'), join(DIST, 'debug.js'));
copyFileSync(join(SRC, 'background/index.js'), join(DIST, 'background.js'));
copyFileSync(
    join(SRC, 'content/form-content-signature.js'),
    join(DIST, 'form-content-signature.js'),
);
copyFileSync(
    join(SRC, 'content/answer-normalization.js'),
    join(DIST, 'answer-normalization-content.js'),
);
copyFileSync(
    join(SRC, 'content/form-heuristics.js'),
    join(DIST, 'form-heuristics.js'),
);
copyFileSync(
    join(SRC, 'content/field-inventory.js'),
    join(DIST, 'field-inventory.js'),
);
copyFileSync(
    join(SRC, 'content/form-validation-errors.js'),
    join(DIST, 'form-validation-errors.js'),
);
copyFileSync(
    join(SRC, 'content/linkedin-parser.js'),
    join(DIST, 'linkedin-parser.js'),
);
copyFileSync(
    join(SRC, 'content/linkedin-page-health.js'),
    join(DIST, 'linkedin-page-health.js'),
);
copyFileSync(
    join(SRC, 'content/linkedin-easy-apply-fields.js'),
    join(DIST, 'linkedin-easy-apply-fields.js'),
);
copyFileSync(
    join(SRC, 'content/linkedin-auto-apply.js'),
    join(DIST, 'linkedin-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/indeed-auto-apply.js'),
    join(DIST, 'indeed-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/totaljobs-auto-apply.js'),
    join(DIST, 'totaljobs-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/glassdoor-auto-apply.js'),
    join(DIST, 'glassdoor-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/simplyhired-auto-apply.js'),
    join(DIST, 'simplyhired-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/reed-auto-apply.js'),
    join(DIST, 'reed-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/cv-library-auto-apply.js'),
    join(DIST, 'cv-library-auto-apply.js'),
);
copyFileSync(
    join(SRC, 'content/focus-tracker.js'),
    join(DIST, 'focus-tracker.js'),
);
copyFileSync(
    join(SRC, 'content/field-highlighter.js'),
    join(DIST, 'field-highlighter.js'),
);
copyFileSync(join(SRC, 'content/index.js'), join(DIST, 'content.js'));
copyFileSync(
    join(SRC, 'sidepanel/sidepanel.html'),
    join(DIST, 'sidepanel.html'),
);
copyFileSync(join(SRC, 'sidepanel/sidepanel.css'), join(DIST, 'sidepanel.css'));
copyFileSync(join(SRC, 'sidepanel/sidepanel.js'), join(DIST, 'sidepanel.js'));
copyFileSync(join(SRC, 'sidepanel/assist.js'), join(DIST, 'assist.js'));
copyFileSync(join(SRC, 'sidepanel/documents.js'), join(DIST, 'documents.js'));
copyFileSync(join(SRC, 'sidepanel/auto-apply.js'), join(DIST, 'auto-apply.js'));
copyFileSync(
    join(SRC, 'sidepanel/auto-apply-manual-resume.js'),
    join(DIST, 'auto-apply-manual-resume.js'),
);
copyFileSync(
    join(SRC, 'sidepanel/pending-fields.js'),
    join(DIST, 'pending-fields-panel.js'),
);
copyFileSync(
    join(SRC, 'sidepanel/auto-apply-manual-resume.js'),
    join(DIST, 'auto-apply-manual-resume.js'),
);

const iconsDir = join(ROOT, 'extension/icons');
const distIconsDir = join(DIST, 'icons');
const faviconSvg = join(ROOT, 'public/favicon.svg');
const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

mkdirSync(iconsDir, { recursive: true });
mkdirSync(distIconsDir, { recursive: true });

function ensureExtensionIcons() {
    if (!existsSync(faviconSvg)) {
        const missingIcons = requiredIcons.filter(
            (icon) => !existsSync(join(iconsDir, icon)),
        );

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

    const stillMissing = requiredIcons.filter(
        (icon) => !existsSync(join(iconsDir, icon)),
    );

    if (stillMissing.length > 0) {
        throw new Error(
            `Failed to generate extension icons: ${stillMissing.join(', ')}`,
        );
    }
}

ensureExtensionIcons();
cpSync(iconsDir, distIconsDir, { recursive: true });

const pingSoundSource = join(ROOT, 'public/sound/ping.mp3');
const distSoundDir = join(DIST, 'sound');

if (!existsSync(pingSoundSource)) {
    throw new Error('Missing extension pause sound at public/sound/ping.mp3');
}

mkdirSync(distSoundDir, { recursive: true });
copyFileSync(pingSoundSource, join(distSoundDir, 'ping.mp3'));

const missingDistIcons = requiredIcons.filter(
    (icon) => !existsSync(join(distIconsDir, icon)),
);

if (missingDistIcons.length > 0) {
    throw new Error(
        `Extension build is missing icons in dist: ${missingDistIcons.join(', ')}`,
    );
}

patchManifest(apiBase);
verifyDistImports();

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
    execSync(`cd "${sourceDir}" && zip -qr "${outputPath}" .`, {
        stdio: 'inherit',
    });
}

function listJsFilesRecursive(dir, base = dir) {
    const files = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absolute = join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...listJsFilesRecursive(absolute, base));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(absolute.slice(base.length + 1));
        }
    }

    return files;
}

function assertNoChromeSidePanelApi(firefoxDist) {
    // AMO flags chrome.sidePanel / browser.sidePanel member access (incl. optional chaining).
    const forbidden = /(?:chrome|browser)\s*\??\s*\.\s*sidePanel\b/;
    const offenders = [];

    for (const relativePath of listJsFilesRecursive(firefoxDist)) {
        const content = readFileSync(join(firefoxDist, relativePath), 'utf8');

        if (forbidden.test(content)) {
            offenders.push(relativePath);
        }
    }

    if (offenders.length > 0) {
        throw new Error(
            `Firefox package still references chrome/browser.sidePanel in: ${offenders.join(', ')}`,
        );
    }
}

function buildFirefoxDist() {
    const firefoxDist = join(ROOT, 'extension/dist-firefox');
    removeDirForce(firefoxDist);
    cpSync(DIST, firefoxDist, { recursive: true });

    // Dual-package: Firefox gets a sidebarAction-only panel helper with no sidePanel APIs.
    copyFileSync(
        join(SRC, 'shared/browser-panel.firefox.js'),
        join(firefoxDist, 'browser-panel.js'),
    );
    assertNoChromeSidePanelApi(firefoxDist);

    const manifestPath = join(firefoxDist, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    applyFirefoxManifest(manifest);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

    return firefoxDist;
}

/**
 * Adapt a Chrome MV3 manifest for Firefox / AMO validation.
 * Strips Chrome-only keys that Firefox warns about or rejects.
 */
function applyFirefoxManifest(manifest) {
    // AMO requires data_collection_permissions for new extensions (Firefox 140+
    // built-in consent). Values must match what we transmit to our first-party API:
    // auth tokens, CV/profile PII, job-page content for drafting, and page URLs.
    // See https://mzl.la/firefox-builtin-data-consent
    // data_collection_permissions requires Firefox desktop 140+ and Android 142+
    // (AMO / built-in consent). Override gecko_android so desktop can stay at 140.
    // See https://mzl.la/firefox-builtin-data-consent
    manifest.browser_specific_settings = {
        gecko: {
            id: 'autocvapply-amo@autocvapply.com',
            strict_min_version: '140.0',
            data_collection_permissions: {
                required: [
                    'authenticationInfo',
                    'personallyIdentifyingInfo',
                    'websiteContent',
                    'browsingActivity',
                ],
            },
        },
        gecko_android: {
            strict_min_version: '142.0',
        },
    };
    // Firefox MV3 backgrounds are event pages only (service workers locked off).
    // Ship scripts alone - including service_worker can leave no background registered
    // (about:debugging shows no "Background script" line) and the sidebar stays blank.
    manifest.background = {
        scripts: ['background.js'],
        type: 'module',
    };
    // Firefox uses sidebar_action; Chrome's side_panel / sidePanel are unsupported.
    // Toolbar action click is wired in background via sidebarAction.open().
    const actionIcons = manifest.action?.default_icon ?? manifest.icons;
    manifest.sidebar_action = {
        default_panel: 'sidepanel.html',
        default_title: 'AutoCVApply',
        default_icon: actionIcons,
    };
    delete manifest.side_panel;
    // Firefox does not implement externally_connectable for web pages.
    delete manifest.externally_connectable;
    delete manifest.action?.default_popup;

    // Chrome-only API permissions: windows is implicit with tabs; sidePanel is Chrome-only.
    const chromeOnlyPermissions = new Set(['windows', 'sidePanel']);

    if (Array.isArray(manifest.permissions)) {
        manifest.permissions = manifest.permissions.filter(
            (permission) => !chromeOnlyPermissions.has(permission),
        );
    }

    return manifest;
}

zipDirectory(DIST, CHROME_ZIP);
copyFileSync(CHROME_ZIP, LEGACY_ZIP);

const firefoxDist = buildFirefoxDist();
zipDirectory(firefoxDist, FIREFOX_ZIP);
removeDirForce(firefoxDist);

console.log(`Extension built to ${DIST}/`);
console.log(`  Chrome zip:  ${CHROME_ZIP}`);
console.log(`  Firefox zip: ${FIREFOX_ZIP}`);
