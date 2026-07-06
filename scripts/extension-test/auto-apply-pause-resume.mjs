#!/usr/bin/env node
import {
    buildAutoApplyPauseQuestion,
    detectUnfilledBlockers,
    isGenericValidationMessage,
    normalizeBlockerField,
    resolveValidationBlockerField,
} from '../../extension/src/shared/auto-apply-blockers.js';
import {
    appendAutoApplyLog,
    createInitialSession,
    isActiveAutoApplyStatus,
    isTerminalAutoApplyStatus,
    pauseAutoApplyForInput,
    resumeAutoApplyFromInput,
} from '../../extension/src/shared/auto-apply-session.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const modalState = {
    validationErrors: ['Please enter a valid phone number'],
    stepFingerprint: 'contact|4|1/3|next|Next',
};

const draftResult = {
    pendingFields: [],
    unfilledRequiredFields: [{
        ref: 'f-phone',
        label: 'Mobile phone number',
        question: 'Mobile phone number',
        field_type: 'text',
        required: true,
    }],
};

const validationMatch = detectUnfilledBlockers(modalState, draftResult);

assert(validationMatch.blocked, 'validation errors with matching unfilled field should block');
assert(validationMatch.reason === 'validation', 'matched validation blocker should use validation reason');
assert(validationMatch.field?.ref === 'f-phone', 'validation blocker should prefer matching unfilled field');

const genericLinkedInValidation = detectUnfilledBlockers({
    validationErrors: ['Please enter a valid answer'],
    invalidFields: [{
        label: 'Location (city)',
        question: 'Location (city)',
        field_type: 'select',
    }],
}, {
    pendingFields: [],
    unfilledRequiredFields: [],
});

assert(genericLinkedInValidation.blocked, 'generic LinkedIn validation should block');
assert(
    genericLinkedInValidation.field?.label === 'Location (city)',
    'generic validation should use field label not error text',
);
assert(
    !isGenericValidationMessage('Please enter a valid phone number'),
    'specific validation messages should not be treated as generic',
);
assert(isGenericValidationMessage('Please enter a valid answer'), 'LinkedIn generic validation should match');

const genericWithoutInvalidFields = detectUnfilledBlockers({
    validationErrors: ['Please enter a valid answer'],
}, {
    pendingFields: [],
    unfilledRequiredFields: [{
        ref: 'f-location',
        label: 'Location (city)',
        question: 'Location (city)',
        field_type: 'select',
        required: true,
    }],
});

assert(
    genericWithoutInvalidFields.field?.label === 'Location (city)',
    'generic validation should map to location candidate field',
);

assert(
    resolveValidationBlockerField([], {
        invalidFields: [{ label: 'Location (city)', field_type: 'select' }],
    })?.label === 'Location (city)',
    'resolveValidationBlockerField should prefer invalidFields from modal state',
);

assert(
    buildAutoApplyPauseQuestion({ label: 'Location (city)', question: 'Location (city)' })
        .includes('Location (city)'),
    'pause question should use location field label',
);

const pendingOnly = detectUnfilledBlockers({}, {
    pendingFields: [{
        ref: 'f-salary',
        label: 'Expected salary',
        question: 'Expected salary',
        field_type: 'text',
        reason: 'missing_answer',
    }],
});

assert(pendingOnly.blocked, 'pending fields should trigger pause');
assert(pendingOnly.reason === 'required_empty', 'pending missing_answer should map to required_empty');

const noMapping = detectUnfilledBlockers({}, {
    pendingFields: [{
        ref: 'f-screen',
        label: 'Are you authorized to work in the US?',
        question: 'Are you authorized to work in the US?',
        field_type: 'select',
        options: ['Yes', 'No'],
        reason: 'missing_profile_data',
    }],
}, { profileData: { profile: {}, application_settings: {} } });

assert(noMapping.blocked, 'select without profile mapping should block');
assert(noMapping.reason === 'no_mapping', 'unmapped select should use no_mapping reason');

const clear = detectUnfilledBlockers({}, { pendingFields: [], unfilledRequiredFields: [] });

assert(!clear.blocked, 'empty draft gaps should not block');

assert(
    buildAutoApplyPauseQuestion({ label: 'Notice period', question: 'What is your notice period?' })
        .startsWith('Auto Apply needs your help: Notice period'),
    'pause question should include field label',
);

let session = createInitialSession({
    platform: 'linkedin',
    roleDescription: 'software engineer',
    maxApplications: 2,
});

session = pauseAutoApplyForInput(session, {
    job: { jobId: '1', title: 'Engineer', company: 'Acme' },
    stepFingerprint: 'step-1',
    tabId: 42,
    blockerField: normalizeBlockerField({ ref: 'f-1', label: 'Notice period', field_type: 'text' }),
    questionText: 'Auto Apply needs your help: Notice period',
    resumeAt: 'fill_and_advance',
});

assert(session.status === 'paused_for_input', 'pauseAutoApplyForInput should set paused status');
assert(session.pauseContext?.tabId === 42, 'pause context should retain tab id');
assert(session.pauseContext?.resumeAt === 'fill_and_advance', 'pause context should retain resume point');

session = resumeAutoApplyFromInput(session);

assert(session.status === 'running', 'resumeAutoApplyFromInput should restore running status');
assert(session.pauseContext === null, 'resume should clear pause context');

session = appendAutoApplyLog(session, 'info', 'still running');

assert(session.log.length === 1, 'session helpers should preserve log entries');

assert(isActiveAutoApplyStatus('running'), 'running should be active');
assert(isActiveAutoApplyStatus('paused_for_input'), 'paused should be active');
assert(!isActiveAutoApplyStatus('stopped'), 'stopped should not be active');
assert(isTerminalAutoApplyStatus('stopped'), 'stopped should be terminal');
assert(isTerminalAutoApplyStatus('completed'), 'completed should be terminal');
assert(isTerminalAutoApplyStatus('error'), 'error should be terminal');
assert(!isTerminalAutoApplyStatus('running'), 'running should not be terminal');

console.log('auto-apply pause/resume tests passed');
