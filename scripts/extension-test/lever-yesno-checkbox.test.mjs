#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FINOM_HTML = join(
    ROOT,
    'tests/fixtures/form-extraction/html/https-jobs-eu-lever-co-pnlfin-23ffb215-7dcb-4b67-847e-c2a7c789951e-apply.html',
);

const CUSTOMER_CARE_LABEL = 'do you have a minimum of 6 months of experience in a customer care role?';

function readYesNoCheckboxState(document, groupName) {
    const inputs = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${groupName}"]`));

    return {
        yes: inputs.find((input) => /^yes$/i.test(String(input.value || '')))?.checked || false,
        no: inputs.find((input) => /^no$/i.test(String(input.value || '')))?.checked || false,
    };
}

test('Lever Yes/No checkbox groups keep only the latest answer', async () => {
    const html = readFileSync(FINOM_HTML, 'utf8');
    const { window } = buildFormDomContext({
        html,
        pageUrl: 'https://jobs.eu.lever.co/pnlfin/23ffb215-7dcb-4b67-847e-c2a7c789951e/apply',
        pageTitle: 'Finom - Customer Care Specialist',
    });

    const groupName = 'cards[7fa9b20c-1e10-42ca-85f1-9ceb04ef2b58][field2]';
    const anchor = window.document.querySelector(`input[type="checkbox"][name="${groupName}"]`);

    assert(anchor, 'Finom customer care checkbox group should exist');

    const appliedYes = window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        CUSTOMER_CARE_LABEL,
        'Yes',
    );
    assert(appliedYes, 'Yes apply should succeed');

    let state = readYesNoCheckboxState(window.document, groupName);
    assert.equal(state.yes, true);
    assert.equal(state.no, false);

    const appliedNo = window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        CUSTOMER_CARE_LABEL,
        'No',
    );
    assert(appliedNo, 'No apply should succeed');

    state = readYesNoCheckboxState(window.document, groupName);
    assert.equal(state.yes, false, 'Yes must be cleared when No is applied');
    assert.equal(state.no, true);
});
