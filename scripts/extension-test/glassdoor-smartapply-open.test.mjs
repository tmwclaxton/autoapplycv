import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORCHESTRATOR = join(
    ROOT,
    'extension/src/shared/auto-apply-orchestrator.js',
);

test('Glassdoor OPEN_APPLY treats Indeed SmartApply navigation as success', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');

    assert.match(source, /navigatedDuringOpenApply/);
    assert.match(
        source,
        /Cannot open Glassdoor Apply while the tab is still on Indeed SmartApply/,
    );
    assert.match(source, /leaveStaleIndeedSmartApplyForGlassdoor/);
    assert.match(source, /closeIndeedAuxiliaryTabs\(session, searchTabId\)/);
    assert.match(source, /smartApplyMatchesExpectedJob/);
    assert.match(source, /smartapply_job_mismatch/);
    assert.match(source, /INDEED_ABANDON_APPLY/);
    assert.match(source, /glassdoor-smartapply-security/);
    assert.match(source, /just a moment\|attention required\|security check/i);
});

test('jobTitlesLooselyMatch accepts related titles and rejects unrelated ones', async () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');
    const match = source.match(
        /function normalizeJobTitleForMatch\(value\) \{[\s\S]*?\nfunction isIndeedDraftSkipStep/,
    );

    assert.ok(match, 'expected job title match helpers in orchestrator');

    const helpers = `${match[0].replace(
        /\nfunction isIndeedDraftSkipStep[\s\S]*$/,
        '',
    )}
return { jobTitlesLooselyMatch, normalizeJobTitleForMatch, smartApplyMatchesExpectedJob };
`;
     
    const { jobTitlesLooselyMatch, smartApplyMatchesExpectedJob } = new Function(
        `${helpers}`,
    )();

    assert.equal(
        jobTitlesLooselyMatch(
            'Software Engineer',
            'Software Engineer - Backend',
        ),
        true,
    );
    assert.equal(
        jobTitlesLooselyMatch(
            'Software Engineer',
            'AWS DevOps Engineer with Chinese Speaking',
        ),
        false,
    );
    assert.equal(
        smartApplyMatchesExpectedJob(
            { jobTitle: 'AWS DevOps Engineer with Chinese Speaking' },
            { title: 'Software Engineer' },
        ).matched,
        false,
    );
    assert.equal(
        jobTitlesLooselyMatch(
            'Embedded Software Engineer (RTOS)',
            'Software Engineer Python SQL - Market Data',
        ),
        false,
        'shared software/engineer tokens must not equate unrelated SmartApply jobs',
    );
    assert.equal(
        smartApplyMatchesExpectedJob(
            {
                jobTitle: 'Software Engineer Python SQL - Market Data',
                jobCompany: 'Client Server',
            },
            {
                title: 'Embedded Software Engineer (RTOS)',
                company: 'Insignis Talent (Part of STR Group)',
            },
        ).matched,
        false,
        'employer mismatch must reject stale SmartApply even if titles share tokens',
    );
});

test('Glassdoor Apply prefers a fresh button click over stale Indeed iframe', () => {
    const glassdoorPath = join(
        ROOT,
        'extension/src/content/glassdoor-auto-apply.js',
    );
    const source = readFileSync(glassdoorPath, 'utf8');
    const clickFn = source.slice(
        source.indexOf('async function clickGlassdoorApply'),
        source.indexOf('function findJobCardById'),
    );

    assert.match(
        clickFn,
        /Prefer a fresh Apply click even if a leftover Indeed iframe/,
    );
    assert.ok(
        clickFn.indexOf('const applyButton = readApplyButton()') <
            clickFn.indexOf('if (hasIndeedApplyIframe())'),
        'Apply button must be checked before treating a leftover iframe as already open',
    );
});
