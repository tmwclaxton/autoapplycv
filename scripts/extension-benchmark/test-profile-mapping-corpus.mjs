#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    isHoursCommitmentQuestionLabel,
    isProfileMappingMismatch,
    isSalaryQuestionLabel,
    resolveProfileMappingForLabel,
    shouldPromptUserForField,
} from '../../extension/src/shared/pending-fields.js';
import { buildProfileMappingCorpus } from './build-profile-mapping-corpus.mjs';


function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function loadCorpus() {
    const jsonPath = join(process.cwd(), 'scripts/extension-benchmark/profile-mapping-corpus.json');

    try {
        const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));

        if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
            return parsed.scenarios;
        }
    } catch {
        // Fall back to generated corpus when JSON has not been built yet.
    }

    return buildProfileMappingCorpus();
}

const emptyProfile = {
    profile: {},
    application_settings: {
        expected_salary_weekly: '',
        expected_salary_monthly: '',
        expected_salary_yearly: '',
        notice_period: '',
    },
};

const fullProfile = {
    profile: {
        full_name: 'Toby Claxton',
        email: 'toby@example.com',
        phone: '7700900123',
        city: 'Belfast',
        linkedin_url: 'https://linkedin.com/in/toby',
        website_url: 'https://example.com',
    },
    application_settings: {
        expected_salary_weekly: '850',
        expected_salary_monthly: '3500',
        expected_salary_yearly: '45000',
        notice_period: '2 weeks',
    },
    computed_earliest_start: '19 July 2026',
};

const identityPaths = new Set([
    'full_name',
    'full_name.first',
    'full_name.last',
    'email',
    'phone',
    '_phone_national',
    'city',
    'linkedin_url',
    'website_url',
    'location',
    'country',
]);

const scenarios = loadCorpus();

assert(scenarios.length >= 100, `Expected at least 100 mapping scenarios, got ${scenarios.length}`);

let passed = 0;

for (const entry of scenarios) {
    const label = entry.label;
    const field = {
        label,
        question: label,
        field_type: entry.field?.field_type ?? 'text',
        options: entry.field?.options ?? null,
        dom: entry.field?.dom ?? null,
    };
    const expect = entry.expect ?? {};
    const mapping = resolveProfileMappingForLabel(label, emptyProfile, field.dom || null);
    const resolvedPath = mapping?.path ?? null;

    if (expect.is_hours_commitment === true) {
        assert(
            isHoursCommitmentQuestionLabel(label),
            `${entry.id}: expected hours commitment for "${label}"`,
        );
    }

    if (expect.is_hours_commitment === false) {
        assert(
            !isHoursCommitmentQuestionLabel(label),
            `${entry.id}: did not expect hours commitment for "${label}"`,
        );
    }

    if (expect.is_salary === true) {
        assert(isSalaryQuestionLabel(label), `${entry.id}: expected salary label for "${label}"`);
    }

    if (expect.is_salary === false) {
        assert(!isSalaryQuestionLabel(label), `${entry.id}: did not expect salary label for "${label}"`);
    }

    if (Object.prototype.hasOwnProperty.call(expect, 'profile_path') && !expect.source_fixture) {
        assert(
            resolvedPath === expect.profile_path,
            `${entry.id}: profile_path expected ${expect.profile_path}, got ${resolvedPath} for "${label}"`,
        );
    }

    if (expect.is_hours_commitment && expect.profile_path && field.options) {
        assert(
            isProfileMappingMismatch(field, { path: expect.profile_path }),
            `${entry.id}: expected mapping mismatch for hours commitment on "${label}"`,
        );
    }

    if (Object.prototype.hasOwnProperty.call(expect, 'should_prompt') && !expect.source_fixture) {
        const shouldPrompt = shouldPromptUserForField(field, emptyProfile);

        assert(
            shouldPrompt === expect.should_prompt,
            `${entry.id}: should_prompt expected ${expect.should_prompt}, got ${shouldPrompt} for "${label}"`,
        );
    }

    if (expect.profile_path && identityPaths.has(expect.profile_path)) {
        const filledPrompt = shouldPromptUserForField(field, fullProfile);
        assert(!filledPrompt, `${entry.id}: filled identity should not prompt for "${label}"`);
    }

    passed += 1;
}

console.log(`profile-mapping corpus tests passed (${passed}/${scenarios.length})`);
