#!/usr/bin/env node
/**
 * Generate the Supported platforms HTML block for README.md from site.ts lists.
 *
 *   node scripts/generate-readme-platforms-section.mjs          # stdout
 *   node scripts/generate-readme-platforms-section.mjs --write  # patch README.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_TS = join(ROOT, 'resources/js/lib/site.ts');
const README = join(ROOT, 'README.md');
const START = '<!-- readme-platforms:start -->';
const END = '<!-- readme-platforms:end -->';

function platformLogoSlug(platform) {
    return platform
        .toLowerCase()
        .replace(/\./g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function platformLogoExtension(sourceUrl) {
    const pathname = sourceUrl.split('?')[0]?.toLowerCase() ?? '';

    return pathname.endsWith('.ico') ? 'ico' : 'png';
}

function parseConstArray(source, constName) {
    const match = source.match(
        new RegExp(
            `export const ${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*as const;`,
        ),
    );

    if (!match) {
        throw new Error(`Could not parse ${constName} from site.ts`);
    }

    return [...match[1].matchAll(/'([^']+)'|^\s*([A-Za-z0-9]+)\s*,?\s*$/gm)]
        .map(([, quoted, bare]) => quoted || bare)
        .filter(Boolean);
}

function parseLogoSources(source) {
    const match = source.match(
        /export const PLATFORM_LOGO_SOURCES[^=]*=\s*\{([\s\S]*?)\};/,
    );

    if (!match) {
        throw new Error('Could not parse PLATFORM_LOGO_SOURCES from site.ts');
    }

    const entries = {};
    const entryPattern =
        /(?:'([^']+)'|([A-Za-z0-9]+)):\s*'(https?:\/\/[^']+)'/gs;

    for (const [, quotedKey, bareKey, sourceUrl] of match[1].matchAll(
        entryPattern,
    )) {
        entries[quotedKey || bareKey] = sourceUrl;
    }

    return entries;
}

function parseSiteUrls(source) {
    const match = source.match(
        /export const PLATFORM_SITE_URLS[^=]*=\s*\{([\s\S]*?)\};/,
    );

    if (!match) {
        throw new Error('Could not parse PLATFORM_SITE_URLS from site.ts');
    }

    const entries = {};
    const entryPattern =
        /(?:'([^']+)'|([A-Za-z0-9]+)):\s*'(https?:\/\/[^']+)'/gs;

    for (const [, quotedKey, bareKey, siteUrl] of match[1].matchAll(
        entryPattern,
    )) {
        entries[quotedKey || bareKey] = siteUrl;
    }

    return entries;
}

function logoTag(platform, sources) {
    const sourceUrl = sources[platform];

    if (!sourceUrl) {
        return '';
    }

    const slug = platformLogoSlug(platform);
    const extension = platformLogoExtension(sourceUrl);

    return `<img src="public/images/platforms/logos/${slug}.${extension}" width="18" height="18" alt="" />`;
}

function platformCell(platform, sources, siteUrls) {
    const label = `${logoTag(platform, sources)} ${platform}`;
    const siteUrl = siteUrls[platform];

    if (!siteUrl) {
        return label;
    }

    return `<a href="${siteUrl}">${label}</a>`;
}

function platformGrid(platforms, sources, siteUrls, columns = 4) {
    const rows = [];

    for (let index = 0; index < platforms.length; index += columns) {
        const slice = platforms.slice(index, index + columns);
        const cells = slice
            .map(
                (platform) =>
                    `<td valign="top">${platformCell(platform, sources, siteUrls)}</td>`,
            )
            .join('');

        rows.push(`<tr>${cells}${'<td></td>'.repeat(columns - slice.length)}</tr>`);
    }

    return `<table>${rows.join('')}</table>`;
}

function main() {
    const site = readFileSync(SITE_TS, 'utf8');
    const sources = parseLogoSources(site);
    const siteUrls = parseSiteUrls(site);
    const atsPlatforms = parseConstArray(site, 'SUPPORTED_PLATFORMS');
    const autoApplySupported = parseConstArray(
        site,
        'AUTO_APPLY_SUPPORTED_PLATFORMS',
    );
    const autoApplyComingSoon = parseConstArray(
        site,
        'AUTO_APPLY_COMING_SOON_PLATFORMS',
    );

    const output = `${START}
Autofill works on most major ATS and employer career sites. **Auto Apply** runs end-to-end from the extension sidebar on supported job boards (search, fill every step, submit). More boards across the UK, Ireland, US, Canada, Australia, and New Zealand are on the way.

### Autofill on ATS and career sites

${platformGrid(atsPlatforms, sources, siteUrls)}

<sub>Plus many more employer career sites and ATS variants.</sub>

### Auto Apply - supported today

${platformGrid(autoApplySupported, sources, siteUrls)}

Full end-to-end apply: search filtered jobs, open each posting, fill every step, and submit from the extension sidebar **Auto Apply** tab.

### Auto Apply - coming soon

${platformGrid(autoApplyComingSoon, sources, siteUrls, 5)}

<sub>+ more boards across the Anglosphere.</sub>

> **Note:** On ATS forms (Greenhouse, Ashby, Workday, etc.) autofill and Draft All fill fields for you - **you review and click Submit yourself**. Job board Auto Apply completes submissions end-to-end on supported boards above.

${END}`;

    if (process.argv.includes('--write')) {
        const readme = readFileSync(README, 'utf8');
        const pattern = new RegExp(
            `${START}[\\s\\S]*?${END}`,
            'm',
        );

        if (!pattern.test(readme)) {
            throw new Error(
                `Could not find ${START} … ${END} markers in README.md`,
            );
        }

        writeFileSync(README, readme.replace(pattern, output));
        console.log(`Updated ${README}`);

        return;
    }

    process.stdout.write(`${output}\n`);
}

main();
