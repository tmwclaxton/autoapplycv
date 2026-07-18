import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    buildAutoApplyManualResumePanelCopy,
    buildAutoApplyPauseBannerMessage,
    isManualResumeAutoApplyPause,
    resolveAutoApplyPauseComposerLockHint,
    resolveAutoApplyPauseReason,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-pause-ui.js')).href
);

const captchaPause = {
    captcha: true,
    pauseReason: 'captcha',
    clarifyingQuestion: 'CAPTCHA detected - solve in the browser, then resume Auto Apply.',
    questionText: 'CAPTCHA detected - solve in the browser, then resume Auto Apply.',
    blockerField: null,
    job: { jobId: 'job-1', title: 'Engineer', company: 'Acme' },
};

assert.equal(resolveAutoApplyPauseReason(captchaPause), 'captcha');
assert.equal(isManualResumeAutoApplyPause(captchaPause), true);
assert.equal(isManualResumeAutoApplyPause({ blockerField: { ref: 'f1' } }), false);

const captchaCopy = buildAutoApplyManualResumePanelCopy(captchaPause);
assert.equal(captchaCopy?.title, 'CAPTCHA / security check');
assert.equal(captchaCopy?.buttonLabel, 'Resume');
assert.match(captchaCopy?.statusLabel || '', /CAPTCHA/);
assert.doesNotMatch(captchaCopy?.composerLockHint || '', /Save & fill/i);
assert.doesNotMatch(captchaCopy?.composerPlaceholder || '', /Save & fill/i);
assert.doesNotMatch(captchaCopy?.statusLabel || '', /We need your help/i);

const banner = buildAutoApplyPauseBannerMessage(captchaPause);
assert.match(banner, /CAPTCHA/);
assert.doesNotMatch(banner, /We need your help/);
assert.doesNotMatch(banner, /Save & fill/i);

assert.match(
    resolveAutoApplyPauseComposerLockHint(captchaPause),
    /Resume/,
);
assert.doesNotMatch(
    resolveAutoApplyPauseComposerLockHint(captchaPause),
    /Save & fill/i,
);

// pauseReason alone is enough (flags missing / stale)
assert.equal(
    resolveAutoApplyPauseReason({ pauseReason: 'captcha' }),
    'captcha',
);
assert.equal(
    buildAutoApplyManualResumePanelCopy({ pauseReason: 'captcha' })?.title,
    'CAPTCHA / security check',
);

const loginCopy = buildAutoApplyManualResumePanelCopy({
    loginRequired: true,
    pauseReason: 'login',
    clarifyingQuestion: 'Sign in required',
});
assert.equal(loginCopy?.title, 'Sign in required');
assert.equal(loginCopy?.buttonLabel, 'Resume');

const clarifyingPause = {
    blockerField: { ref: 'field-1', label: 'Work auth' },
    clarifyingQuestion: 'Are you authorized to work?',
};
assert.equal(isManualResumeAutoApplyPause(clarifyingPause), false);
assert.equal(buildAutoApplyManualResumePanelCopy(clarifyingPause), null);
assert.match(
    resolveAutoApplyPauseComposerLockHint(clarifyingPause),
    /Save & fill/,
);

console.log('auto-apply-manual-resume.test.mjs: ok');
