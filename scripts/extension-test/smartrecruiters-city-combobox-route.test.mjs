#!/usr/bin/env node
/**
 * SmartRecruiters one-click City is role=combobox. setFieldValue must route to
 * setSmartRecruitersLocationValue before the generic Ashby combobox path.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
    join(ROOT, 'extension/src/content/form-heuristics.js'),
    'utf8',
);

test('combobox setFieldValue prefers SmartRecruiters location over Ashby', () => {
    const comboboxBranchStart = source.indexOf("if (role === 'combobox')");
    const ashbyCall = source.indexOf(
        'const filled = await setAshbyComboboxValue(element, value);',
        comboboxBranchStart,
    );
    const srRoute = source.indexOf(
        'if (isSmartRecruitersLocationInput(element))',
        comboboxBranchStart,
    );

    assert.ok(comboboxBranchStart > 0);
    assert.ok(srRoute > comboboxBranchStart);
    assert.ok(ashbyCall > srRoute);
    assert.match(
        source.slice(srRoute, ashbyCall),
        /setSmartRecruitersLocationValue/,
    );
});
