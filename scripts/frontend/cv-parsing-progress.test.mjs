/**
 * Unit tests for optimistic CV parsing progress stages.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    CV_PARSING_DEFAULT_HINT,
    CV_PARSING_SLOW_HINT,
    CV_PARSING_SLOW_HINT_AFTER_MS,
    CV_PARSING_STAGES,
    hintForElapsed,
    stageIndexForElapsed,
    stageStatus,
} from '../../resources/js/lib/cvParsingProgress.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('cvParsingProgress stages', () => {
    it('exposes calm upload → read → AI extract labels (no fake Saving stage)', () => {
        assert.deepEqual(
            CV_PARSING_STAGES.map((stage) => stage.id),
            ['uploading', 'reading', 'extracting', 'extracting_slow'],
        );
        assert.deepEqual(
            CV_PARSING_STAGES.map((stage) => stage.label),
            [
                'Uploading…',
                'Reading PDF / OCR…',
                'Extracting profile with AI…',
                'Still extracting - large CVs take longer…',
            ],
        );
        assert.ok(
            !CV_PARSING_STAGES.some((stage) => /saving/i.test(stage.label)),
        );
    });

    it('advances by elapsed time without a fake stuck 99%', () => {
        assert.equal(stageIndexForElapsed(0), 0);
        assert.equal(stageIndexForElapsed(1_499), 0);
        assert.equal(stageIndexForElapsed(1_500), 1);
        assert.equal(stageIndexForElapsed(7_999), 1);
        assert.equal(stageIndexForElapsed(8_000), 2);
        assert.equal(stageIndexForElapsed(44_999), 2);
        assert.equal(stageIndexForElapsed(45_000), 3);
        assert.equal(stageIndexForElapsed(120_000), 3);
    });

    it('shows a minute-scale AI hint after 45s', () => {
        assert.equal(CV_PARSING_SLOW_HINT_AFTER_MS, 45_000);
        assert.equal(hintForElapsed(0), CV_PARSING_DEFAULT_HINT);
        assert.equal(hintForElapsed(44_999), CV_PARSING_DEFAULT_HINT);
        assert.equal(hintForElapsed(45_000), CV_PARSING_SLOW_HINT);
        assert.match(CV_PARSING_SLOW_HINT, /up to a minute/i);
    });

    it('marks earlier stages done and later ones pending', () => {
        assert.equal(stageStatus(0, 2), 'done');
        assert.equal(stageStatus(2, 2), 'current');
        assert.equal(stageStatus(3, 2), 'pending');
    });

    it('wires staged progress into onboarding and the shared overlay', () => {
        const onboarding = readFileSync(
            join(root, 'resources/js/pages/Onboarding.vue'),
            'utf8',
        );
        const overlay = readFileSync(
            join(root, 'resources/js/components/cv/CvParsingOverlay.vue'),
            'utf8',
        );

        assert.match(onboarding, /CvParsingProgress/);
        assert.match(onboarding, /useCvParsingProgress/);
        assert.match(onboarding, /step\.value = 'review'/);
        assert.match(onboarding, /PostboxMark/);
        assert.match(onboarding, /Accept: 'application\/json'/);
        assert.doesNotMatch(onboarding, /router\.patch/);
        assert.doesNotMatch(onboarding, />OK</);
        assert.match(overlay, /CvParsingProgress/);
        assert.match(overlay, /useCvParsingProgress/);
        assert.doesNotMatch(onboarding, /Reading your CV…/);
    });
});
