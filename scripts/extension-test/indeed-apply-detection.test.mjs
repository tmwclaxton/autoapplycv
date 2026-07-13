#!/usr/bin/env node
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Regression guard for Indeed split-view false external-apply skips:
 * prefer Indeed Apply CTA inside the job pane before any external marker.
 */
function detectIndeedApplyReady(html) {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const root =
        document.querySelector('#jobsearch-ViewjobPaneWrapper') || document;

    const readIndeedApplyButton = () =>
        root.querySelector('#indeedApplyButton, [data-testid="indeedApplyButton-test"]');

    const readExternalApplyMarker = () => {
        if (root === document) {
            return null;
        }

        for (const element of root.querySelectorAll('a, button')) {
            if (/^apply on company site$/i.test(element.textContent.trim())) {
                return element;
            }
        }

        return null;
    };

    if (readIndeedApplyButton()) {
        return 'indeed_apply';
    }

    if (readExternalApplyMarker()) {
        return 'external';
    }

    return 'pending';
}

const splitViewHtml = `
<div id="jobsearch-ViewjobPaneWrapper">
  <button id="indeedApplyButton">Apply with Indeed</button>
</div>
<aside><a href="#">Apply on company site</a></aside>
`;

assert.equal(detectIndeedApplyReady(splitViewHtml), 'indeed_apply');

const paneMissingHtml = `
<aside><a href="#">Apply on company site</a></aside>
`;

assert.equal(detectIndeedApplyReady(paneMissingHtml), 'pending');

function cardHasIndeedApplyFromHtml(html, cardSelector = '.job_seen_beacon') {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const card = document.querySelector(cardSelector);

    const normalize = (text) =>
        String(text || '')
            .replace(/\s+/g, ' ')
            .trim();

    const cardText = normalize(card?.textContent || '');

    const cardHasExternalApply = () => {
        for (const element of card.querySelectorAll('a, button, span')) {
            const text = normalize(element.textContent);

            if (/^apply on company site$/i.test(text)) {
                return true;
            }
        }

        return /\bapply on company site\b/i.test(cardText);
    };

    if (cardHasExternalApply()) {
        return false;
    }

    if (card.querySelector('[data-testid="indeedApply"]')) {
        return true;
    }

    return /\beasily apply\b/i.test(cardText);
}

const dsqf7MixedCardsHtml = `
<div class="job_seen_beacon">
  <a href="/viewjob?jk=abc1234567890abcd"><span>Indeed Apply role</span></a>
  <span data-testid="indeedApply">Easily apply</span>
</div>
<div class="job_seen_beacon">
  <a href="/viewjob?jk=def1234567890abcd"><span>External role</span></a>
  <span>Apply on company site</span>
</div>
`;

assert.equal(
    cardHasIndeedApplyFromHtml(dsqf7MixedCardsHtml, '.job_seen_beacon:first-child'),
    true,
);
assert.equal(
    cardHasIndeedApplyFromHtml(
        dsqf7MixedCardsHtml,
        '.job_seen_beacon:last-child',
    ),
    false,
);

/**
 * Unknown cards (no Easily apply badge and no external CTA) must not be treated as
 * Indeed Apply - otherwise Auto Apply wastes time opening company-site jobs that
 * only appeared because Indeed's DSQF7 filter is leaky.
 */
function toQueuedIndeedJob(indeedApply) {
    return {
        indeedApply,
        easyApply: indeedApply === true,
    };
}

assert.deepEqual(toQueuedIndeedJob(true), {
    indeedApply: true,
    easyApply: true,
});
assert.deepEqual(toQueuedIndeedJob(false), {
    indeedApply: false,
    easyApply: false,
});
assert.deepEqual(toQueuedIndeedJob(null), {
    indeedApply: null,
    easyApply: false,
});

function shouldForceDirectJobOpen({ noIndeedApply, needsNavigation }) {
    if (noIndeedApply) {
        return false;
    }

    return Boolean(needsNavigation);
}

assert.equal(
    shouldForceDirectJobOpen({ noIndeedApply: true, needsNavigation: true }),
    false,
);
assert.equal(
    shouldForceDirectJobOpen({ noIndeedApply: false, needsNavigation: true }),
    true,
);

function selectJobNeedsNavigation({ alreadyApplied = false, noIndeedApply = false }) {
    return !alreadyApplied && !noIndeedApply;
}

assert.equal(
    selectJobNeedsNavigation({ noIndeedApply: true }),
    false,
);
assert.equal(
    selectJobNeedsNavigation({ alreadyApplied: true }),
    false,
);
assert.equal(selectJobNeedsNavigation({}), true);

console.log('indeed-apply-detection tests passed.');
