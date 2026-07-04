import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { MANIFEST_PATH } from './paths.mjs';

export function loadManifest() {
    if (!existsSync(MANIFEST_PATH)) {
        return { version: 1, scenarios: [] };
    }

    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

export function saveManifest(manifest) {
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function upsertScenario(manifest, scenario) {
    const index = manifest.scenarios.findIndex((row) => row.id === scenario.id);

    if (index === -1) {
        manifest.scenarios.push(scenario);
    } else {
        manifest.scenarios[index] = { ...manifest.scenarios[index], ...scenario };
    }
}

export function getScenario(manifest, id) {
    return manifest.scenarios.find((row) => row.id === id) ?? null;
}
