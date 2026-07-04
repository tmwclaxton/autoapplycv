import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROFILE_PATH = join(ROOT, 'tests/fixtures/form-fill-screenshots/ashby-notion-profile.json');

/** @typedef {{ ref: string, label: string, value: string, domInputId?: string }} FillCase */

/**
 * @returns {{
 *   id: string,
 *   pageUrl: string,
 *   profile: Record<string, string>,
 *   ocrMustAppearAfterFill: string[],
 *   ocrNotes: string[],
 * }}
 */
export function loadAshbyNotionProfile() {
    const raw = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));

    return {
        id: raw.id,
        pageUrl: raw.page_url,
        profile: raw.profile,
        ocrMustAppearAfterFill: raw.ocr_must_appear_after_fill,
        ocrNotes: raw.ocr_notes ?? [],
    };
}

/**
 * Field refs match buildSnapshot order on the Ashby Notion fixture (f0 = first field).
 *
 * @returns {FillCase[]}
 */
export function ashbyNotionFillCases() {
    const { profile } = loadAshbyNotionProfile();

    return [
        { ref: 'f0', label: 'anchor days', value: profile.anchor_days },
        { ref: 'f1', label: 'visa sponsorship', value: profile.visa_sponsorship },
        { ref: 'f2', label: 'full name', value: profile.full_name, domInputId: '_systemfield_name' },
        { ref: 'f3', label: 'email', value: profile.email, domInputId: '_systemfield_email' },
        { ref: 'f4', label: 'phone', value: profile.phone, domInputId: '8039f8aa-c269-467e-bdea-dec068474224' },
        { ref: 'f6', label: 'linkedin profile', value: profile.linkedin, domInputId: 'dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb' },
        { ref: 'f7', label: 'pronouns', value: profile.pronouns, domInputId: '8e2fc878-49e3-46fd-8c39-c49a11bf8b7a_b0a5aba8-dbb7-41a9-b548-f72cc3e48956-labeled-radio-2' },
        { ref: 'f8', label: 'how did you hear', value: profile.hear_about, domInputId: '8e2fc878-49e3-46fd-8c39-c49a11bf8b7a_0b3b7773-f6d9-4032-9ab1-368c4164e95a-labeled-checkbox-0' },
    ];
}

export function ashbyNotionLocationCase() {
    const { profile } = loadAshbyNotionProfile();

    return { label: 'location', value: profile.location };
}
