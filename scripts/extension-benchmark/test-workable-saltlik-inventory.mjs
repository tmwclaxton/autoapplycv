#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const profilePayload = {
    profile: {
        full_name: 'Toby Claxton',
        email: 'tmwclaxton@gmail.com',
        phone: '+447837370669',
    },
    application_settings: {},
};

const settings = {
    phoneCountryCode: '+44',
};

const html = readFileSync(
    join(
        process.cwd(),
        'tests/fixtures/form-extraction/html/https-apply-workable-com-saltlik-j-e79e183191-apply.html',
    ),
    'utf8',
);

const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://apply.workable.com/saltlik/j/E79E183191/apply/',
    pageTitle: 'General Application Form - SALTLIK - Application',
});

const heuristics = window.AutoCVApplyFormHeuristics;
const inventory = window.AutoCVApplyFieldInventory;
const doc = window.document;

const hostCheckbox = doc.querySelector('input[name="2628998"]');

assert(hostCheckbox, 'SALTLIK host/hostess checkbox should exist');

const hostLabel = heuristics.getQuestionLabel(hostCheckbox);

assert(
    hostLabel === 'what role/s are you applying for?',
    `Workable checkbox group label should be the group question, got "${hostLabel}"`,
);

assert(
    !/svgs not supported/i.test(hostLabel),
    'Workable group label must not include SVG fallback noise',
);

const fields = [];

heuristics.eachDraftableField(
    doc,
    profilePayload,
    settings,
    {},
    (field) => {
        fields.push(field);
    },
    { includeFilled: true },
);

const roleField = fields.find((field) => field.label === 'what role/s are you applying for?');

assert(roleField, 'SALTLIK should inventory one grouped role checkbox field');
assert(
    roleField.field_type === 'checkbox',
    'SALTLIK role field should be a checkbox group',
);
assert(
    roleField.options?.some((option) => /host\/hostess/i.test(option)),
    'SALTLIK role field options should include Host/Hostess without SVG noise',
);

const polluted = fields.filter((field) => /svgs not supported/i.test(field.label || ''));

assert(
    polluted.length === 0,
    `Inventory should not contain SVG-polluted labels (${polluted.map((field) => field.label).join('; ')})`,
);

const snapshot = inventory.buildSnapshot(doc, profilePayload, settings, {});

assert(
    snapshot.elements.some((element) => element.question === 'what role/s are you applying for?'),
    'Field inventory snapshot should include grouped SALTLIK role question',
);

console.log('test-workable-saltlik-inventory: all assertions passed');
