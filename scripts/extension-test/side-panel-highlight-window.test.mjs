#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    buildSidePanelVisibilityMessage,
    shouldPaintFieldHighlights,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/side-panel-state.js')).href);

test('shouldPaintFieldHighlights requires open side panel and matching host window', () => {
    assert.equal(
        shouldPaintFieldHighlights({
            sidePanelOpen: true,
            tabWindowId: 3,
            hostWindowId: 3,
        }),
        true,
    );
    assert.equal(
        shouldPaintFieldHighlights({
            sidePanelOpen: false,
            tabWindowId: 3,
            hostWindowId: 3,
        }),
        false,
    );
    assert.equal(
        shouldPaintFieldHighlights({
            sidePanelOpen: true,
            tabWindowId: 4,
            hostWindowId: 3,
        }),
        false,
    );
    assert.equal(
        shouldPaintFieldHighlights({
            sidePanelOpen: true,
            tabWindowId: 3,
            hostWindowId: null,
        }),
        false,
    );
});

test('buildSidePanelVisibilityMessage scopes paint flag to the tab window', () => {
    const storage = {
        sidePanelOpen: true,
        sidePanelHostWindowId: 11,
    };

    assert.deepEqual(
        buildSidePanelVisibilityMessage(storage, { tabWindowId: 11 }),
        {
            type: 'AUTOFILL_VISIBILITY_CHANGED',
            sidePanelOpen: true,
            hostWindowId: 11,
            paintFieldHighlights: true,
        },
    );
    assert.deepEqual(
        buildSidePanelVisibilityMessage(storage, { tabWindowId: 22 }),
        {
            type: 'AUTOFILL_VISIBILITY_CHANGED',
            sidePanelOpen: true,
            hostWindowId: 11,
            paintFieldHighlights: false,
        },
    );
    assert.equal(
        buildSidePanelVisibilityMessage({ sidePanelOpen: false, sidePanelHostWindowId: 11 }, { tabWindowId: 11 })
            .paintFieldHighlights,
        false,
    );
});
