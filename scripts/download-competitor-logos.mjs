#!/usr/bin/env node
/**
 * Download competitor logos into public/images/competitors/logos/.
 * Re-run when BlogCompetitorComparisons::logoSources() changes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHP_FILE = join(ROOT, 'app/Support/BlogCompetitorComparisons.php');
const OUT_DIR = join(ROOT, 'public/images/competitors/logos');

function logoExtension(sourceUrl) {
    const pathname = (sourceUrl.split('?')[0] ?? '').toLowerCase();

    if (pathname.endsWith('.ico')) {
        return 'ico';
    }

    if (pathname.endsWith('.svg')) {
        return 'svg';
    }

    return 'png';
}

function parseLogoSources(source) {
    const match = source.match(
        /public static function logoSources\(\): array\s*\{\s*return \[([\s\S]*?)\];\s*\}/,
    );

    if (!match) {
        throw new Error('Could not parse logoSources() from BlogCompetitorComparisons.php');
    }

    const entries = {};
    const entryPattern = /'([^']+)'\s*=>\s*'(https?:\/\/[^']+)'/g;

    for (const [, id, sourceUrl] of match[1].matchAll(entryPattern)) {
        entries[id] = sourceUrl;
    }

    if (Object.keys(entries).length === 0) {
        throw new Error('No competitor logo sources found in BlogCompetitorComparisons.php');
    }

    return entries;
}

function isImageBuffer(buffer, contentType = '') {
    if (buffer.length < 32) {
        return false;
    }

    if (contentType.includes('image/') || contentType.includes('svg')) {
        return true;
    }

    const header = buffer.subarray(0, 8).toString('hex');
    const asText = buffer.subarray(0, 64).toString('utf8').trimStart();

    return (
        header.startsWith('89504e47') ||
        header.startsWith('00000100') ||
        header.startsWith('47494638') ||
        asText.startsWith('<svg') ||
        asText.startsWith('<?xml')
    );
}

async function downloadLogo(id, sourceUrl) {
    const extension = logoExtension(sourceUrl);
    const outPath = join(OUT_DIR, `${id}.${extension}`);
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
            `${id} (${sourceUrl}): response was not an image (HTTP ${response.status}, ${contentType || 'unknown type'})`,
        );
    }

    writeFileSync(outPath, buffer);

    return {
        id,
        extension,
        bytes: buffer.length,
        status: response.status,
    };
}

async function main() {
    const sources = parseLogoSources(readFileSync(PHP_FILE, 'utf8'));

    mkdirSync(OUT_DIR, { recursive: true });

    const results = [];
    const failures = [];

    for (const [id, sourceUrl] of Object.entries(sources)) {
        try {
            results.push(await downloadLogo(id, sourceUrl));
        } catch (error) {
            failures.push(
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    console.log(`Downloaded ${results.length} competitor logos to ${OUT_DIR}`);

    for (const result of results) {
        console.log(
            `  ${result.id}.${result.extension} (${result.bytes} bytes, HTTP ${result.status})`,
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
