#!/usr/bin/env node
/**
 * Ramp Ashby: "Legal name" maps to full_name; open-source / AI project links
 * map to GitHub when present so Draft All does not sidebar-pending them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import {
    resolveIdentityProfileAnswer,
    resolveProfileMappingForLabel,
} from '../../extension/src/shared/pending-fields.js';

const PROFILE = {
    full_name: 'Toby Claxton',
    email: 'toby@example.com',
    github_url: 'https://github.com/tmwclaxton',
    linkedin_url: 'https://www.linkedin.com/in/toby-claxton/',
};

test('legal name maps to full_name identity', () => {
    const mapping = resolveProfileMappingForLabel('legal name', PROFILE);
    assert.equal(mapping?.path, 'full_name');
    assert.equal(
        resolveIdentityProfileAnswer(
            { label: 'legal name', field_type: 'text', required: true },
            PROFILE,
        ),
        'Toby Claxton',
    );
});

test('open source / AI project link maps to GitHub', () => {
    const label =
        "Link any AI projects or open source contributions you're proud of (PRs or tools you use, personal libraries, side projects, etc.)";
    const mapping = resolveProfileMappingForLabel(label, PROFILE);
    assert.equal(mapping?.path, '_profile_link.github');
    assert.equal(
        resolveIdentityProfileAnswer(
            { label, field_type: 'text', required: true },
            PROFILE,
        ),
        'https://github.com/tmwclaxton',
    );
});

test('Draft All plan fills legal name and GitHub OSS link', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f0',
                label: 'legal name',
                field_type: 'text',
                required: true,
            },
            {
                ref: 'f7',
                label: "link any ai projects or open source contributions you're proud of (prs or tools you use, personal libraries, side projects, etc.)",
                field_type: 'text',
                required: true,
            },
        ],
        profileData: PROFILE,
    });

    const identityAnswers = plan.applyStages
        .filter((stage) => stage.type === 'identity' || stage.answers)
        .flatMap((stage) => stage.answers || []);

    const byRef = Object.fromEntries(
        identityAnswers.map((answer) => [answer.ref, answer.answer]),
    );

    // Identity stage may be tagged differently - also scan all stages.
    const allAnswers = plan.applyStages.flatMap(
        (stage) => stage.answers || [],
    );
    const legal = allAnswers.find((answer) => answer.ref === 'f0');
    const oss = allAnswers.find((answer) => answer.ref === 'f7');

    assert.equal(legal?.answer, 'Toby Claxton');
    assert.equal(oss?.answer, 'https://github.com/tmwclaxton');
    assert.equal(
        plan.pendingFields.some((field) => field.ref === 'f0'),
        false,
    );
    assert.equal(
        plan.pendingFields.some((field) => field.ref === 'f7'),
        false,
    );
    void byRef;
});
