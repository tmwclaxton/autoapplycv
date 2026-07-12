#!/usr/bin/env node
/**
 * Download platform logos into public/images/platforms/logos/.
 * Re-run when PLATFORM_LOGO_SOURCES changes in resources/js/lib/site.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_TS = join(ROOT, 'resources/js/lib/site.ts');
const OUT_DIR = join(ROOT, 'public/images/platforms/logos');

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

function parsePlatformLogoSources(source) {
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

    if (Object.keys(entries).length === 0) {
        throw new Error('No platform logo sources found in site.ts');
    }

    return entries;
}

function isImageBuffer(buffer, contentType = '') {
    if (buffer.length < 32) {
        return false;
    }

    if (contentType.includes('image/')) {
        return true;
    }

    const header = buffer.subarray(0, 8).toString('hex');

    return (
        header.startsWith('89504e47') ||
        header.startsWith('00000100') ||
        header.startsWith('47494638')
    );
}

async function downloadLogo(platform, sourceUrl) {
    const slug = platformLogoSlug(platform);
    const extension = platformLogoExtension(sourceUrl);
    const outPath = join(OUT_DIR, `${slug}.${extension}`);
    const response = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AutoCVApplyLogoSync/1.0)',
        },
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';

    if (!isImageBuffer(buffer, contentType)) {
        throw new Error(
            `${platform} (${sourceUrl}): response was not an image (HTTP ${response.status}, ${contentType || 'unknown type'})`,
        );
    }

    writeFileSync(outPath, buffer);

    return {
        platform,
        slug,
        extension,
        bytes: buffer.length,
        status: response.status,
    };
}

async function main() {
    const sources = parsePlatformLogoSources(readFileSync(SITE_TS, 'utf8'));

    mkdirSync(OUT_DIR, { recursive: true });

    const results = [];
    const failures = [];

    for (const [platform, sourceUrl] of Object.entries(sources)) {
        try {
            results.push(await downloadLogo(platform, sourceUrl));
        } catch (error) {
            failures.push(
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    console.log(`Downloaded ${results.length} platform logos to ${OUT_DIR}`);

    for (const result of results) {
        console.log(
            `  ${result.slug}.${result.extension} (${result.platform}, ${result.bytes} bytes, HTTP ${result.status})`,
        );
    }

    if (failures.length > 0) {
        console.error('\nFailed downloads:');

        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }

        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
