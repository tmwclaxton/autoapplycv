import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export const FIXTURE_ROOT = join(ROOT, 'tests/fixtures/form-extraction');
export const HTML_DIR = join(FIXTURE_ROOT, 'html');
export const EXPECTED_DIR = join(FIXTURE_ROOT, 'expected');
export const MANIFEST_PATH = join(FIXTURE_ROOT, 'manifest.json');
export const VET_REPORT_PATH = join(FIXTURE_ROOT, 'vet-report.json');
export const DISCOVERED_URLS_PATH = join(FIXTURE_ROOT, 'discovered-urls.json');
export const FORM_HEURISTICS_PATH = join(ROOT, 'extension/src/content/form-heuristics.js');
export const FIELD_INVENTORY_PATH = join(ROOT, 'extension/src/content/field-inventory.js');
