#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { parseNdjsonChunk } = await import(pathToFileURL(join(ROOT, 'extension/src/shared/draft-all-stream.js')).href);

test('parseNdjsonChunk parses complete lines and keeps partial carry', () => {
    const first = parseNdjsonChunk('{"type":"batch","batch_index":0}\n{"type":"usage"');
    assert.equal(first.events.length, 1);
    assert.equal(first.events[0].type, 'batch');
    assert.equal(first.carry, '{"type":"usage"');

    const second = parseNdjsonChunk(',"phase":"draft"}\n{"type":"complete"}\n', first.carry);
    assert.equal(second.events.length, 2);
    assert.equal(second.events[0].type, 'usage');
    assert.equal(second.events[0].phase, 'draft');
    assert.equal(second.events[1].type, 'complete');
    assert.equal(second.carry, '');
});

test('parseNdjsonChunk ignores blank lines and malformed JSON', () => {
    const parsed = parseNdjsonChunk('\n{"type":"batch"}\nnot-json\n{"type":"complete"}\n');

    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.events[0].type, 'batch');
    assert.equal(parsed.events[1].type, 'complete');
});
