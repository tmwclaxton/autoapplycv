#!/usr/bin/env node
import {
    AUTO_APPLY_VALIDATION_RETRY_LIMIT,
    buildAutoApplyClarifyingQuestion,
    buildAutoApplyPauseQuestion,
    buildAutoApplyValidationRetryQuestion,
    detectUnfilledBlockers,
    fieldHasValidationError,
    fieldsMatchBlocker,
    findFieldValidationError,
    isGenericValidationMessage,
    normalizeBlockerField,
    resolveValidationBlockerField,
} from '../../extension/src/shared/auto-apply-blockers.js';
import {
    buildAutoApplyPauseBannerMessage,
    buildAutoApplyPauseMessageFingerprint,
    isAutoApplyPauseBlockerField,
    resolveAutoApplyPauseClarifyingDisplay,
    resolveAutoApplyPauseComposerValue,
    resolveAutoApplyPendingFieldDisplayLabel,
    resolveAutoApplyPendingFieldHint,
} from '../../extension/src/shared/auto-apply-pause-ui.js';
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

const repeatedLabelField = {
    label: 'How many years of work experience do you have with Microsoft Azure? '
        + 'How many years of work experience do you have with Microsoft Azure? '
        + 'How many years of work experience do you have with Microsoft Azure?',
    question: 'How many years of work experience do you have with Microsoft Azure? '
        + 'How many years of work experience do you have with Microsoft Azure? '
        + 'How many years of work experience do you have with Microsoft Azure?',
    field_type: 'text',
};

const clarifyingQuestion = buildAutoApplyClarifyingQuestion(repeatedLabelField);

assert(
    clarifyingQuestion.split('How many years').length - 1 === 1,
    'clarifying question should dedupe repeated field labels',
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
        === 'What is your notice period?',
    'pause question should prefer descriptive clarifying question text',
);

const azureField = normalizeBlockerField({
    ref: 'f-azure-years',
    label: 'How many years of work experience do you have with Microsoft Azure?',
    field_type: 'text',
});

const numericValidationModal = {
    validationErrors: ['Enter a whole number between 0 and 99'],
    invalidFields: [{
        label: 'How many years of work experience do you have with Microsoft Azure?',
        question: 'How many years of work experience do you have with Microsoft Azure?',
        field_type: 'text',
    }],
};

assert(
    fieldHasValidationError(numericValidationModal, azureField),
    'numeric validation modal should match blocked azure field',
);
assert(
    findFieldValidationError(numericValidationModal, azureField) === 'Enter a whole number between 0 and 99',
    'findFieldValidationError should return LinkedIn numeric validation message',
);
assert(
    fieldsMatchBlocker(azureField, numericValidationModal.invalidFields[0]),
    'fieldsMatchBlocker should match azure field by label',
);

const retryQuestion = buildAutoApplyValidationRetryQuestion(azureField, {
    validationError: 'Enter a whole number between 0 and 99',
    lastAttempt: '1 year of azure',
    validationAttempt: 1,
});

assert(retryQuestion.includes('1 year of azure'), 'validation retry question should include rejected attempt');
assert(retryQuestion.includes('Enter a whole number between 0 and 99'), 'validation retry question should include LinkedIn error');
assert(retryQuestion.includes('What should I enter instead?'), 'validation retry question should ask for correction');

const maxRetryQuestion = buildAutoApplyPauseQuestion(azureField, {
    validationError: 'Enter a whole number between 0 and 99',
    lastAttempt: '1 year of azure',
    validationAttempt: AUTO_APPLY_VALIDATION_RETRY_LIMIT,
});

assert(
    maxRetryQuestion.includes('Auto Apply is stuck on this field'),
    'validation retry question should mention stuck state at retry limit',
);

const retryPauseContext = {
    blockerField: azureField,
    clarifyingQuestion: retryQuestion,
    questionText: retryQuestion,
    validationError: 'Enter a whole number between 0 and 99',
    validationAttempt: 1,
    lastAttempt: '1 year of azure',
};

assert(
    resolveAutoApplyPauseComposerValue(retryPauseContext) === '',
    'validation retry should not prefill Assist composer',
);
assert(
    resolveAutoApplyPauseClarifyingDisplay(retryPauseContext) === retryQuestion,
    'validation retry clarifying question should be available for the pending fields header',
);

const firstPauseContext = {
    blockerField: { ref: 'f-notice', label: 'Notice period', question: 'What is your notice period?' },
    clarifyingQuestion: 'What is your notice period?',
    questionText: 'What is your notice period?',
};

assert(
    resolveAutoApplyPauseComposerValue(firstPauseContext) === '',
    'first pause should not prefill Assist composer',
);
assert(
    resolveAutoApplyPauseClarifyingDisplay(firstPauseContext) === 'What is your notice period?',
    'first pause clarifying question should be available for the pending fields header',
);
assert(
    resolveAutoApplyPendingFieldDisplayLabel(firstPauseContext.blockerField, firstPauseContext) === '',
    'blocker field card should not duplicate the clarifying question when it is the only card',
);
assert(
    /notice period/i.test(
        resolveAutoApplyPendingFieldDisplayLabel(firstPauseContext.blockerField, firstPauseContext, {
            pendingFieldCount: 3,
        }),
    ),
    'blocker field card should show its label when multiple pending cards are visible',
);

const locationField = {
    ref: 'f-location',
    label: 'Location (city)',
    question: 'Location (city)',
    field_type: 'select',
};

const locationPauseContext = {
    blockerField: locationField,
    clarifyingQuestion: buildAutoApplyPauseQuestion(locationField),
    questionText: buildAutoApplyPauseQuestion(locationField),
};

assert(
    resolveAutoApplyPauseComposerValue(locationPauseContext) === '',
    'location pause should not prefill Assist composer',
);
assert(
    resolveAutoApplyPauseClarifyingDisplay(locationPauseContext).includes('Location (city)'),
    'location pause clarifying question should be available for the pending fields header',
);
assert(
    buildAutoApplyPauseBannerMessage(locationPauseContext).includes('Location (city)'),
    'location pause banner should reference field label only',
);
assert(
    resolveAutoApplyPendingFieldDisplayLabel(locationField, locationPauseContext) === '',
    'pending fields card should not duplicate the clarifying question during Auto Apply pause',
);
assert(
    resolveAutoApplyPendingFieldHint(locationField, locationPauseContext)?.includes('Save & fill'),
    'pending fields should point users to Save & fill during Auto Apply pause',
);
assert(
    isAutoApplyPauseBlockerField(locationField, locationPauseContext),
    'location field should match active Auto Apply pause blocker',
);
assert(
    buildAutoApplyPauseMessageFingerprint(locationPauseContext).includes('f-location'),
    'pause fingerprint should include blocker ref',
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
    clarifyingQuestion: 'What is your notice period?',
    questionText: 'What is your notice period?',
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
