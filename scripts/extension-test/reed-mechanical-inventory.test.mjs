#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { canUseMechanicalInventory } = await import(
    pathToFileURL(join(ROOT, 'extension/dist/draft-all-optimizations.js')).href
);

test('Reed one-question dropdown + Continue uses mechanical inventory', () => {
    const ok = canUseMechanicalInventory({
        elements: [
            {
                ref: 'f0',
                question: 'what is your sex?',
                field_type: 'select',
                options: ['Male', 'Female', 'Prefer not to say'],
            },
        ],
        controls: [{ ref: 'c0', role: 'button', name: 'Continue' }],
    });

    assert.equal(ok, true);
});

test('Reed Yes/No dropdown + Continue uses mechanical inventory', () => {
    const ok = canUseMechanicalInventory({
        elements: [
            {
                ref: 'f0',
                question: 'do you hold a full uk driving license?',
                field_type: 'select',
                options: ['Yes', 'No'],
            },
        ],
        controls: [{ ref: 'c0', role: 'button', name: 'Continue' }],
    });

    assert.equal(ok, true);
});
