#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildJobSearchUrl } from '../../extension/src/shared/auto-apply-platforms.js';
import { buildIndeedJobSearchUrl } from '../../extension/src/shared/indeed-platform.js';
import { buildLinkedInJobSearchUrl } from '../../extension/src/shared/linkedin-platform.js';
import { sanitizeAutoApplyRoleDescription } from '../../extension/src/shared/auto-apply-role.js';

const ukSoftwareProfile = {
    profile: {
        full_name: 'James Mitchell',
        headline: 'Senior Laravel Developer',
    },
};

assert.equal(
    sanitizeAutoApplyRoleDescription('Senior Laravel Developer, James Mitchell', ukSoftwareProfile),
    'Senior Laravel Developer',
);

assert.equal(
    sanitizeAutoApplyRoleDescription('James Mitchell, Senior Laravel Developer', ukSoftwareProfile),
    'Senior Laravel Developer',
);

assert.equal(
    sanitizeAutoApplyRoleDescription('software engineer', ukSoftwareProfile),
    'software engineer',
);

assert.equal(
    sanitizeAutoApplyRoleDescription('James Mitchell', ukSoftwareProfile),
    '',
);

const indeedUrl = buildIndeedJobSearchUrl(
    sanitizeAutoApplyRoleDescription('software engineer', ukSoftwareProfile),
    { filters: { location: 'London' } },
);

assert.equal(new URL(indeedUrl).searchParams.get('q'), 'software engineer');
assert.ok(!indeedUrl.includes('James'), `Indeed search URL must not contain profile name: ${indeedUrl}`);

const linkedInUrl = buildLinkedInJobSearchUrl(
    sanitizeAutoApplyRoleDescription('software engineer', ukSoftwareProfile),
    { filters: { location: 'London' } },
);

assert.equal(new URL(linkedInUrl).searchParams.get('keywords'), 'software engineer');
assert.ok(!linkedInUrl.includes('Mitchell'), `LinkedIn search URL must not contain profile name: ${linkedInUrl}`);

const pollutedRole = sanitizeAutoApplyRoleDescription(
    'Senior Laravel Developer, James Mitchell',
    ukSoftwareProfile,
);
const totalJobsUrl = buildJobSearchUrl('totaljobs', pollutedRole, {
    filters: { location: 'London' },
});

assert.ok(!totalJobsUrl.includes('james-mitchell'), `Totaljobs URL must not contain profile name: ${totalJobsUrl}`);
assert.match(totalJobsUrl, /senior-laravel-developer/i);

console.log('auto-apply-role.test.mjs: ok');
