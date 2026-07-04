#!/usr/bin/env node
/**
 * Reconcile manifest.json with HTML fixtures on disk.
 * Preserves existing scenario metadata; adds missing entries as pending.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';

const manifest = loadManifest();
const known = new Set(manifest.scenarios.map((row) => row.id));
let added = 0;

function inferCategory(id) {
    if (id.startsWith('syn-mega-')) {
        const match = id.match(/^syn-mega-([a-z]+)-\d+$/);

        return match ? `mega-${match[1]}` : 'mega';
    }

    if (id.startsWith('syn-fw-')) {
        return `framework-${id.split('-')[2] || 'unknown'}`;
    }

    if (id.startsWith('syn-ix-')) {
        return `interactive-${id.split('-')[2] || 'unknown'}`;
    }

    if (id.startsWith('syn-')) {
        return id.split('-')[1] || 'synthetic';
    }

    return 'scraped';
}

function inferSource(id) {
    return id.startsWith('syn-') ? 'synthetic' : 'scraped';
}

function pageUrlFromHtml(htmlPath, id) {
    const html = readFileSync(htmlPath, 'utf8');
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];

    if (canonical) {
        return canonical;
    }

    return `https://example.test/corpus/${id}`;
}

function titleFromHtml(htmlPath) {
    const html = readFileSync(htmlPath, 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();

    return title || 'Job Application';
}

for (const filename of readdirSync(HTML_DIR).filter((name) => name.endsWith('.html')).sort()) {
    const id = filename.replace(/\.html$/, '');

    if (known.has(id)) {
        continue;
    }

    const htmlPath = join(HTML_DIR, filename);

    upsertScenario(manifest, {
        id,
        category: inferCategory(id),
        source: inferSource(id),
        status: 'pending',
        html_file: filename,
        page_url: pageUrlFromHtml(htmlPath, id),
        page_title: titleFromHtml(htmlPath),
        notes: '',
        requires_interaction: false,
        interaction_steps: [],
    });
    known.add(id);
    added += 1;
}

saveManifest(manifest);
console.log(`Manifest rebuilt: ${manifest.scenarios.length} scenarios (${added} added).`);
console.log(`Path: ${MANIFEST_PATH}`);
