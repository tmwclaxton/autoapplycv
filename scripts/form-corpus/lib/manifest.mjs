import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { MANIFEST_PATH } from './paths.mjs';

/**
 * @typedef {Object} ScenarioVariety
 * @property {string} [ats_style]
 * @property {string[]} [widgets]
 * @property {string} [structure]
 * @property {string} [field_count_band]
 */

/**
 * @typedef {Object} ManifestScenario
 * @property {string} id
 * @property {string} [category]
 * @property {string} [source]
 * @property {string} [status]
 * @property {string} html_file
 * @property {string} [page_url]
 * @property {string} [page_title]
 * @property {string} [notes]
 * @property {ScenarioVariety} [variety]
 * @property {string} [pattern_signature]
 * @property {string} [flow_group]
 * @property {boolean} [requires_interaction]
 * @property {Array<Record<string, unknown>>} [interaction_steps]
 * @property {string[]} [vet_issues]
 */

/**
 * @typedef {{ version: number, scenarios: ManifestScenario[] }} Manifest
 */

export function loadManifest() {
    if (!existsSync(MANIFEST_PATH)) {
        return { version: 1, scenarios: [] };
    }

    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/**
 * When bridge scrape saves while vet-corpus updated status on disk, keep vetted rows.
 *
 * @param {Manifest} manifest
 * @param {Manifest | null} diskManifest
 * @returns {Manifest}
 */
export function preserveVettedScenarioStatus(manifest, diskManifest) {
    if (!diskManifest?.scenarios?.length) {
        return manifest;
    }

    const diskById = new Map(
        diskManifest.scenarios.map((row) => [row.id, row]),
    );

    return {
        ...manifest,
        scenarios: manifest.scenarios.map((row) => {
            const onDisk = diskById.get(row.id);

            if (!onDisk || onDisk.status !== 'vetted' || row.status !== 'pending') {
                return row;
            }

            return {
                ...row,
                status: 'vetted',
                vet_issues: onDisk.vet_issues ?? row.vet_issues,
                variety: onDisk.variety ?? row.variety,
                pattern_signature: onDisk.pattern_signature ?? row.pattern_signature,
            };
        }),
    };
}

export function saveManifest(manifest) {
    let toWrite = manifest;

    if (existsSync(MANIFEST_PATH)) {
        try {
            const diskManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
            toWrite = preserveVettedScenarioStatus(manifest, diskManifest);
        } catch {
            toWrite = manifest;
        }
    }

    writeFileSync(MANIFEST_PATH, `${JSON.stringify(toWrite, null, 2)}\n`);
}

export function upsertScenario(manifest, scenario) {
    const index = manifest.scenarios.findIndex((row) => row.id === scenario.id);

    if (index === -1) {
        manifest.scenarios.push(scenario);
    } else {
        const existing = manifest.scenarios[index];
        const merged = { ...existing, ...scenario };

        if (existing.status === 'vetted' && scenario.status === 'pending') {
            merged.status = 'vetted';
        }

        manifest.scenarios[index] = merged;
    }
}

export function getScenario(manifest, id) {
    return manifest.scenarios.find((row) => row.id === id) ?? null;
}
