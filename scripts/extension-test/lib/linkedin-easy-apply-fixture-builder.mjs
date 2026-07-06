/**
 * Builds authentic LinkedIn Easy Apply modal HTML for offline corpus fixtures.
 * DOM patterns mirror extension/src/content/linkedin-auto-apply.js selectors.
 */

const MODAL_STYLE = 'position: fixed; inset: 40px; z-index: 9999; background: #fff; display: block;';
const VISIBLE_INLINE = 'style="display: block; position: absolute; width: 200px; height: 24px;"';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildErrorFeedback(message) {
    return `
        <div class="artdeco-inline-feedback artdeco-inline-feedback--error" role="alert" ${VISIBLE_INLINE}>
            <span class="artdeco-inline-feedback__message">${escapeHtml(message)}</span>
        </div>`;
}

function buildFieldError(message) {
    return `<span class="artdeco-form-element__error-text" ${VISIBLE_INLINE}>${escapeHtml(message)}</span>`;
}

function buildTextField({
    id,
    label,
    type = 'text',
    name,
    value = '',
    required = false,
    error = null,
    errorClass = '',
}) {
    const requiredAttr = required ? ' required aria-required="true"' : '';

    return `
        <div class="fb-dash-form-element ${errorClass}">
            <label class="fb-dash-form-element__label" for="${id}">${escapeHtml(label)}</label>
            <input
                id="${id}"
                class="fb-dash-form-element__input artdeco-text-input--input"
                type="${type}"
                name="${name}"
                value="${escapeHtml(value)}"
                ${requiredAttr}
            />
            ${error ? buildFieldError(error) : ''}
            ${error ? buildErrorFeedback(error) : ''}
        </div>`;
}

function buildRadioGroup({
    legend,
    name,
    options,
    error = null,
}) {
    const optionHtml = options.map((option) => `
            <label class="fb-dash-form-element__label">
                <input type="radio" name="${name}" value="${escapeHtml(option.value)}" />
                ${escapeHtml(option.label)}
            </label>`).join('');

    return `
        <fieldset class="fb-dash-form-element">
            <legend class="jobs-easy-apply-form-section__title">${escapeHtml(legend)}</legend>
            ${optionHtml}
            ${error ? buildFieldError(error) : ''}
            ${error ? buildErrorFeedback(error) : ''}
        </fieldset>`;
}

function buildSelectField({
    id,
    label,
    name,
    options,
    error = null,
}) {
    const optionHtml = options.map((option) => `
                <option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');

    return `
        <div class="fb-dash-form-element">
            <label class="fb-dash-form-element__label" for="${id}">${escapeHtml(label)}</label>
            <select id="${id}" name="${name}" class="fb-dash-form-element__select">
                <option value="">Select an option</option>
                ${optionHtml}
            </select>
            ${error ? buildFieldError(error) : ''}
            ${error ? buildErrorFeedback(error) : ''}
        </div>`;
}

function buildTextareaField({
    id,
    label,
    name,
    value = '',
    required = false,
    error = null,
}) {
    const requiredAttr = required ? ' required aria-required="true"' : '';

    return `
        <div class="fb-dash-form-element">
            <label class="fb-dash-form-element__label" for="${id}">${escapeHtml(label)}</label>
            <textarea
                id="${id}"
                class="fb-dash-form-element__textarea"
                name="${name}"
                rows="4"
                ${requiredAttr}
            >${escapeHtml(value)}</textarea>
            ${error ? buildFieldError(error) : ''}
            ${error ? buildErrorFeedback(error) : ''}
        </div>`;
}

function buildFileUpload({ id, label, name, error = null }) {
    return `
        <div class="fb-dash-form-element">
            <label class="fb-dash-form-element__label" for="${id}">${escapeHtml(label)}</label>
            <input id="${id}" type="file" name="${name}" accept=".pdf,.doc,.docx" />
            ${error ? buildFieldError(error) : ''}
            ${error ? buildErrorFeedback(error) : ''}
        </div>`;
}

function buildFooterButtons({
    primaryLabel,
    primaryAction = 'next',
    primaryDisabled = false,
    showBack = false,
    showReview = false,
}) {
    const disabledClass = primaryDisabled ? ' artdeco-button--disabled' : '';
    const disabledAttr = primaryDisabled ? ' disabled aria-disabled="true"' : '';
    const dataAttr = primaryAction === 'submit'
        ? ' data-live-test-easy-apply-submit-button=""'
        : ' data-easy-apply-next-button="" data-live-test-easy-apply-next-button=""';

    const buttons = [];

    if (showBack) {
        buttons.push('<button type="button" class="artdeco-button artdeco-button--2 artdeco-button--muted">Back</button>');
    }

    buttons.push('<button type="button" class="artdeco-button artdeco-button--2 artdeco-button--secondary">Cancel</button>');

    if (showReview && primaryAction !== 'review') {
        buttons.push('<button type="button" class="artdeco-button artdeco-button--2 artdeco-button--primary">Review</button>');
    }

    buttons.push(`
        <button
            type="button"
            class="artdeco-button artdeco-button--2 artdeco-button--primary${disabledClass}"
            aria-label="${escapeHtml(primaryLabel)}"
            ${dataAttr}
            ${disabledAttr}
        >
            ${escapeHtml(primaryLabel)}
        </button>`);

    return `
    <footer class="jobs-easy-apply-footer artdeco-modal__actionbar">
        ${buttons.join('\n        ')}
    </footer>`;
}

function buildModal({
    heading,
    stepIndicator = null,
    bodyHtml,
    footerHtml,
    spinner = false,
    extraBody = '',
    jobTitle = 'Software Engineer',
    company = 'Acme Labs',
}) {
    const spinnerHtml = spinner
        ? '<div class="artdeco-loader jobs-loader" data-test-loader="" style="display: block; width: 48px; height: 48px;"></div>'
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>LinkedIn Easy Apply - ${escapeHtml(heading)}</title>
</head>
<body>
<div
    class="jobs-easy-apply-modal artdeco-modal"
    data-test-modal=""
    role="dialog"
    aria-labelledby="easy-apply-modal-title"
    style="${MODAL_STYLE}"
>
    <button type="button" class="artdeco-modal__dismiss" aria-label="Dismiss">&times;</button>
    <div class="jobs-easy-apply-content">
        <p class="jobs-easy-apply-content__subtitle">${escapeHtml(jobTitle)} at ${escapeHtml(company)}</p>
        ${stepIndicator ? `<div class="artdeco-stepper__indicator">${escapeHtml(stepIndicator)}</div>` : ''}
        <h2 id="easy-apply-modal-title" class="jobs-easy-apply-form-section__title">${escapeHtml(heading)}</h2>
        ${spinnerHtml}
        <form class="jobs-easy-apply-form">
            ${bodyHtml}
        </form>
        ${extraBody}
    </div>
    ${footerHtml}
</div>
</body>
</html>
`;
}

function buildAlreadyAppliedPage(options = {}) {
    const { jobTitle = 'Software Engineer', company = 'Acme Labs' } = options;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>LinkedIn Job - Already Applied</title>
</head>
<body>
<div class="jobs-details">
    <h1>${escapeHtml(jobTitle)}</h1>
    <p>${escapeHtml(company)}</p>
    <button
        type="button"
        class="jobs-apply-button jobs-apply-button--applied artdeco-button artdeco-button--2"
        aria-label="Applied"
        disabled
        style="display: inline-block; position: absolute; width: 120px; height: 40px;"
    >
        Applied
    </button>
</div>
</body>
</html>
`;
}

export function buildContactStep(options = {}) {
    const {
        step = 1,
        total = 4,
        emailValue = 'candidate@example.com',
        phoneValue = '+44 7700 900123',
        emailError = null,
        phoneError = null,
        primaryAction = 'next',
        primaryLabel = 'Continue to next step',
        jobTitle = 'Software Engineer',
        company = 'Acme Labs',
    } = options;

    return buildModal({
        heading: 'Contact info',
        stepIndicator: `Step ${step} of ${total}`,
        jobTitle,
        company,
        bodyHtml: `
            <div class="jobs-easy-apply-form-section__group">
                ${buildTextField({
        id: 'contact-name',
        label: 'First and last name',
        name: 'name',
        value: 'Alex Candidate',
        required: true,
    })}
                ${buildTextField({
        id: 'contact-email',
        label: 'Email address',
        type: 'email',
        name: 'email',
        value: emailValue,
        required: true,
        error: emailError,
        errorClass: emailError ? 'fb-dash-form-element__error-field' : '',
    })}
                ${buildTextField({
        id: 'contact-phone',
        label: 'Mobile phone number',
        type: 'tel',
        name: 'phone',
        value: phoneValue,
        required: true,
        error: phoneError,
        errorClass: phoneError ? 'fb-dash-form-element__error-field' : '',
    })}
            </div>`,
        footerHtml: buildFooterButtons({
            primaryLabel: primaryAction === 'submit' ? 'Submit application' : primaryLabel,
            primaryAction,
        }),
    });
}

export function buildQuestionsStep(options = {}) {
    const {
        step = 2,
        total = 4,
        includeSalary = false,
        includeWorkAuth = false,
        includeCoverLetter = false,
        coverLetterRequired = false,
        radioError = null,
        salaryError = null,
        workAuthError = null,
        coverLetterError = null,
        jobTitle = 'Software Engineer',
        company = 'Acme Labs',
    } = options;

    const sections = [
        buildRadioGroup({
            legend: 'How many years of experience do you have with this role?',
            name: 'experience_years',
            options: [
                { value: '0-1', label: 'Less than 1 year' },
                { value: '1-3', label: '1-3 years' },
                { value: '3-5', label: '3-5 years' },
                { value: '5+', label: '5+ years' },
            ],
            error: radioError,
        }),
        buildSelectField({
            id: 'work-location',
            label: 'Are you willing to work on-site?',
            name: 'work_location',
            options: [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'hybrid', label: 'Hybrid' },
            ],
        }),
    ];

    if (includeSalary) {
        sections.push(buildTextField({
            id: 'salary-expectation',
            label: 'What is your expected salary (GBP)?',
            name: 'salary',
            value: salaryError ? '' : '65000',
            required: true,
            error: salaryError,
            errorClass: salaryError ? 'fb-dash-form-element__error-field' : '',
        }));
    }

    if (includeWorkAuth) {
        sections.push(buildRadioGroup({
            legend: 'Are you legally authorized to work in the United Kingdom?',
            name: 'work_authorization',
            options: [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
            ],
            error: workAuthError,
        }));
    }

    if (includeCoverLetter) {
        sections.push(buildTextareaField({
            id: 'cover-letter',
            label: coverLetterRequired ? 'Cover letter (required)' : 'Cover letter (optional)',
            name: 'cover_letter',
            value: coverLetterError ? '' : 'I am excited to apply for this role.',
            required: coverLetterRequired,
            error: coverLetterError,
        }));
    }

    return buildModal({
        heading: 'Additional Questions',
        stepIndicator: `Step ${step} of ${total}`,
        jobTitle,
        company,
        bodyHtml: `<div class="jobs-easy-apply-form-section__group">${sections.join('')}</div>`,
        footerHtml: buildFooterButtons({
            primaryLabel: 'Continue to next step',
            showBack: true,
        }),
    });
}

export function buildResumeStep(options = {}) {
    const {
        step = 2,
        total = 4,
        uploadError = null,
        jobTitle = 'Product Designer',
        company = 'Design Co',
    } = options;

    return buildModal({
        heading: 'Resume',
        stepIndicator: `Step ${step} of ${total}`,
        jobTitle,
        company,
        bodyHtml: `
            <div class="jobs-easy-apply-form-section__group">
                ${buildFileUpload({
        id: 'resume-upload',
        label: 'Upload resume (PDF, DOC, DOCX)',
        name: 'resume',
        error: uploadError,
    })}
                <p class="jobs-easy-apply-form-section__helper-text">Be sure to include an updated resume.</p>
            </div>`,
        footerHtml: buildFooterButtons({
            primaryLabel: 'Continue to next step',
            showBack: true,
        }),
    });
}

export function buildReviewStep(options = {}) {
    const {
        step = 3,
        total = 4,
        jobTitle = 'Software Engineer',
        company = 'Acme Labs',
    } = options;

    return buildModal({
        heading: 'Review your application',
        stepIndicator: `Step ${step} of ${total}`,
        jobTitle,
        company,
        bodyHtml: `
            <div class="jobs-easy-apply-form-section__group">
                <div class="jobs-easy-apply-review-section">
                    <h3>Contact info</h3>
                    <p>Alex Candidate · candidate@example.com · +44 7700 900123</p>
                </div>
                <div class="jobs-easy-apply-review-section">
                    <h3>Resume</h3>
                    <p>Alex_Candidate_CV.pdf</p>
                </div>
            </div>`,
        footerHtml: buildFooterButtons({
            primaryLabel: 'Review',
            primaryAction: 'review',
            showBack: true,
        }),
    });
}

export function buildSubmittedStep(options = {}) {
    const {
        jobTitle = 'Software Engineer',
        company = 'Acme Labs',
    } = options;

    return buildModal({
        heading: 'Application sent',
        jobTitle,
        company,
        bodyHtml: `
            <div class="jobs-easy-apply-form-section__group">
                <p class="artdeco-inline-feedback artdeco-inline-feedback--success">
                    Your application was sent to ${escapeHtml(company)}.
                </p>
                <p>Thanks for applying. You can track your application in the Applied tab.</p>
            </div>`,
        footerHtml: `
    <footer class="jobs-easy-apply-footer artdeco-modal__actionbar">
        <button type="button" class="artdeco-button artdeco-button--2 artdeco-button--primary">Done</button>
    </footer>`,
        extraBody: `
<div class="artdeco-toast-item artdeco-toast-item--success" data-test-artdeco-toast-item-type="success">
    Application submitted
</div>`,
    });
}

export function buildValidationFixture(kind) {
    switch (kind) {
        case 'empty-email':
            return buildContactStep({
                emailValue: '',
                emailError: 'Please enter a valid email address.',
            });
        case 'empty-phone':
            return buildContactStep({
                phoneValue: '',
                phoneError: 'Please enter a valid phone number.',
            });
        case 'invalid-email':
            return buildContactStep({
                emailValue: 'not-an-email',
                emailError: 'Please enter a valid email address.',
            });
        case 'missing-radio':
            return buildQuestionsStep({
                radioError: 'Please make a selection.',
            });
        case 'salary-blank':
            return buildQuestionsStep({
                includeSalary: true,
                salaryError: 'Please enter a number.',
            });
        case 'multiple-inline':
            return buildContactStep({
                emailValue: '',
                phoneValue: '',
                emailError: 'Please enter a valid email address.',
                phoneError: 'Please enter a valid phone number.',
            });
        case 'please-make-selection':
            return buildQuestionsStep({
                includeWorkAuth: true,
                radioError: 'Please make a selection.',
                workAuthError: 'Please make a selection.',
            });
        case 'required-textarea':
            return buildQuestionsStep({
                includeCoverLetter: true,
                coverLetterRequired: true,
                coverLetterError: 'Please enter a response.',
            });
        case 'work-auth-missing':
            return buildQuestionsStep({
                includeWorkAuth: true,
                workAuthError: 'Please make a selection.',
            });
        default:
            throw new Error(`Unknown validation fixture kind: ${kind}`);
    }
}

export function buildEdgeFixture(kind) {
    switch (kind) {
        case 'modal-spinner':
            return buildModal({
                heading: 'Contact info',
                stepIndicator: 'Step 1 of 4',
                spinner: true,
                bodyHtml: `
                    <div class="jobs-easy-apply-form-section__group">
                        ${buildTextField({ id: 'contact-email', label: 'Email address', type: 'email', name: 'email', value: 'candidate@example.com' })}
                    </div>`,
                footerHtml: buildFooterButtons({ primaryLabel: 'Continue to next step' }),
            });
        case 'next-disabled':
            return buildModal({
                heading: 'Contact info',
                stepIndicator: 'Step 1 of 4',
                bodyHtml: `
                    <div class="jobs-easy-apply-form-section__group">
                        ${buildTextField({ id: 'contact-email', label: 'Email address', type: 'email', name: 'email', value: '', required: true })}
                    </div>`,
                footerHtml: buildFooterButtons({
                    primaryLabel: 'Continue to next step',
                    primaryDisabled: true,
                }),
            });
        case 'already-applied':
            return buildAlreadyAppliedPage();
        case 'single-step-submit':
            return buildContactStep({
                step: 1,
                total: 1,
                primaryAction: 'submit',
            });
        case 'success-submitted':
            return buildSubmittedStep();
        default:
            throw new Error(`Unknown edge fixture kind: ${kind}`);
    }
}

export const FLOW_DEFINITIONS = [
    {
        flowId: 'swe-simple',
        jobTitle: 'Software Engineer',
        company: 'Acme Labs',
        notes: 'Simple contact-only flow with standard four-step progression.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions' },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'backend-engineer',
        jobTitle: 'Backend Engineer',
        company: 'Cloud Systems Ltd',
        notes: 'Multi-step flow with radio and select screening questions.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions' },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'salary-analyst',
        jobTitle: 'Financial Analyst',
        company: 'Numbers Inc',
        notes: 'Requires numeric salary expectation on step 2.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions', includeSalary: true },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'selection-pm',
        jobTitle: 'Product Manager',
        company: 'Launchpad',
        notes: 'Screening questions with required radio selections.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions' },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'cover-letter-writer',
        jobTitle: 'Content Writer',
        company: 'Story Studio',
        notes: 'Optional cover letter textarea on step 2.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions', includeCoverLetter: true },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'resume-upload-designer',
        jobTitle: 'Product Designer',
        company: 'Design Co',
        notes: 'Resume upload step before review.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'resume' },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'work-auth-engineer',
        jobTitle: 'DevOps Engineer',
        company: 'InfraWorks',
        notes: 'Work authorization yes/no screening on step 2.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions', includeWorkAuth: true },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'data-scientist',
        jobTitle: 'Data Scientist',
        company: 'Insight Analytics',
        notes: 'Mixed screening questions with salary and work auth.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions', includeSalary: true, includeWorkAuth: true },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
    {
        flowId: 'marketing-coordinator',
        jobTitle: 'Marketing Coordinator',
        company: 'Brand Collective',
        notes: 'Standard four-step flow with cover letter on step 2.',
        steps: [
            { step: 1, builder: 'contact' },
            { step: 2, builder: 'questions', includeCoverLetter: true },
            { step: 3, builder: 'review' },
            { step: 4, builder: 'submitted' },
        ],
    },
];

export const VALIDATION_FIXTURES = [
    { id: 'error-empty-email', kind: 'empty-email', requiredFields: ['email'], expectedErrors: ['Please enter a valid email address.'] },
    { id: 'error-empty-phone', kind: 'empty-phone', requiredFields: ['phone'], expectedErrors: ['Please enter a valid phone number.'] },
    { id: 'error-invalid-email', kind: 'invalid-email', requiredFields: ['email'], expectedErrors: ['Please enter a valid email address.'] },
    { id: 'error-missing-radio', kind: 'missing-radio', requiredFields: ['experience_years'], expectedErrors: ['Please make a selection.'] },
    { id: 'error-salary-blank', kind: 'salary-blank', requiredFields: ['salary'], expectedErrors: ['Please enter a number.'] },
    { id: 'error-multiple-inline', kind: 'multiple-inline', requiredFields: ['email', 'phone'], expectedErrors: ['Please enter a valid email address.', 'Please enter a valid phone number.'] },
    { id: 'error-please-make-selection', kind: 'please-make-selection', requiredFields: ['experience_years', 'work_authorization'], expectedErrors: ['Please make a selection.'] },
    { id: 'error-required-textarea', kind: 'required-textarea', requiredFields: ['cover_letter'], expectedErrors: ['Please enter a response.'] },
    { id: 'error-work-auth-missing', kind: 'work-auth-missing', requiredFields: ['work_authorization'], expectedErrors: ['Please make a selection.'] },
];

export const EDGE_FIXTURES = [
    { id: 'edge-modal-spinner', kind: 'modal-spinner', expectsModal: true, primaryAction: 'next', expectsValidationErrors: false },
    { id: 'edge-next-disabled', kind: 'next-disabled', expectsModal: true, primaryAction: 'next', actionDisabled: true, expectsValidationErrors: false },
    { id: 'edge-already-applied', kind: 'already-applied', expectsModal: false, expectsAlreadyApplied: true },
    { id: 'edge-single-step-submit', kind: 'single-step-submit', expectsModal: true, primaryAction: 'submit', expectsValidationErrors: false },
    { id: 'edge-success-submitted', kind: 'success-submitted', expectsModal: true, primaryAction: null, expectsSubmitted: true, expectsValidationErrors: false },
];

export function buildFlowStepHtml(flow, stepDef) {
    const total = flow.steps.length;
    const common = {
        step: stepDef.step,
        total,
        jobTitle: flow.jobTitle,
        company: flow.company,
    };

    switch (stepDef.builder) {
        case 'contact':
            return buildContactStep(common);
        case 'questions':
            return buildQuestionsStep({
                ...common,
                includeSalary: stepDef.includeSalary,
                includeWorkAuth: stepDef.includeWorkAuth,
                includeCoverLetter: stepDef.includeCoverLetter,
            });
        case 'resume':
            return buildResumeStep(common);
        case 'review':
            return buildReviewStep(common);
        case 'submitted':
            return buildSubmittedStep(common);
        default:
            throw new Error(`Unknown builder: ${stepDef.builder}`);
    }
}

export function buildScenarioManifest() {
    const scenarios = [];

    for (const flow of FLOW_DEFINITIONS) {
        for (const stepDef of flow.steps) {
            const filename = `linkedin-easy-apply-${flow.flowId}-step${stepDef.step}-${stepDef.builder}.html`;
            let primaryAction = 'next';

            const expectsSubmitted = stepDef.builder === 'submitted';

            if (stepDef.builder === 'review') {
                primaryAction = 'review';
            } else if (expectsSubmitted) {
                primaryAction = null;
            }

            scenarios.push({
                id: `linkedin-${flow.flowId}-step${stepDef.step}`,
                file: filename,
                flow_id: flow.flowId,
                step: stepDef.step,
                expects_validation_errors: false,
                required_fields: stepDef.step === 1 ? ['email', 'phone'] : [],
                primary_action: primaryAction,
                expects_submitted: expectsSubmitted,
                notes: `${flow.notes} Step ${stepDef.step}: ${stepDef.builder}.`,
            });
        }
    }

    for (const fixture of VALIDATION_FIXTURES) {
        scenarios.push({
            id: fixture.id,
            file: `${fixture.id}.html`,
            flow_id: null,
            step: null,
            expects_validation_errors: true,
            required_fields: fixture.requiredFields,
            expected_errors: fixture.expectedErrors,
            primary_action: 'next',
            notes: `Validation error state: ${fixture.kind}.`,
        });
    }

    for (const fixture of EDGE_FIXTURES) {
        scenarios.push({
            id: fixture.id,
            file: `${fixture.id}.html`,
            flow_id: null,
            step: null,
            expects_validation_errors: fixture.expectsValidationErrors ?? false,
            required_fields: [],
            primary_action: fixture.primaryAction,
            expects_modal: fixture.expectsModal ?? true,
            expects_already_applied: fixture.expectsAlreadyApplied ?? false,
            expects_submitted: fixture.expectsSubmitted ?? false,
            action_disabled: fixture.actionDisabled ?? false,
            notes: `Edge case: ${fixture.kind}.`,
        });
    }

    return { scenarios };
}
