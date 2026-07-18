import {
    isManualResumeAutoApplyPause,
    resolveAutoApplyPauseClarifyingDisplay,
    resolveAutoApplyPendingFieldDisplayLabel,
    resolveAutoApplyPendingFieldHint,
} from './auto-apply-pause-ui.js';

function normalizePauseBlockerField(blockerField) {
    if (!blockerField?.ref) {
        return null;
    }

    return {
        ref: blockerField.ref,
        label: blockerField.label || blockerField.question || '',
        question: blockerField.question || blockerField.label || '',
        field_type: blockerField.field_type || blockerField.type || 'text',
        options: blockerField.options ?? null,
        dom: blockerField.dom ?? null,
        reason: 'missing_answer',
    };
}

function buildDisplayFields(fields, pauseContext) {
    const blockerField = normalizePauseBlockerField(pauseContext?.blockerField);

    if (!blockerField) {
        return fields;
    }

    if (fields.some((field) => field.ref === blockerField.ref)) {
        return fields;
    }

    return [blockerField, ...fields];
}

export function initPendingFieldsPanel({
    showMessage,
    getAutoApplyPauseContext = () => null,
}) {
    const sectionEl = document.getElementById('pending-fields-section');
    const clarifyingQuestionEl = document.getElementById(
        'pending-fields-clarifying-question',
    );
    const listEl = document.getElementById('pending-fields-list');
    const summaryEl = document.getElementById('pending-fields-summary');

    if (!sectionEl || !listEl) {
        return { refreshPendingFields: async () => {} };
    }

    let fields = [];
    let savingRef = null;

    function renderClarifyingQuestion(
        pauseContext,
        hasAutoApplyPause,
        displayFields,
    ) {
        if (!clarifyingQuestionEl) {
            return;
        }

        if (hasAutoApplyPause) {
            clarifyingQuestionEl.textContent =
                resolveAutoApplyPauseClarifyingDisplay(pauseContext);
            clarifyingQuestionEl.hidden =
                clarifyingQuestionEl.textContent.trim() === '';

            return;
        }

        const firstPending = displayFields[0];
        const pendingQuestion = String(
            firstPending?.question || firstPending?.label || '',
        ).trim();

        if (pendingQuestion) {
            clarifyingQuestionEl.textContent = pendingQuestion;
            clarifyingQuestionEl.hidden = false;

            return;
        }

        clarifyingQuestionEl.hidden = true;
        clarifyingQuestionEl.textContent = '';
    }

    function render() {
        listEl.replaceChildren();

        const pauseContext = getAutoApplyPauseContext();

        // CAPTCHA / login / identity pauses use the dedicated Resume panel, not Save & fill.
        if (isManualResumeAutoApplyPause(pauseContext)) {
            sectionEl.hidden = true;
            summaryEl.textContent = '';
            renderClarifyingQuestion(null, false, []);

            return;
        }

        const hasAutoApplyPause = Boolean(pauseContext?.blockerField?.ref);
        const displayFields = buildDisplayFields(fields, pauseContext);

        renderClarifyingQuestion(
            pauseContext,
            hasAutoApplyPause,
            displayFields,
        );

        if (displayFields.length === 0) {
            sectionEl.hidden = true;
            summaryEl.textContent = '';

            return;
        }

        sectionEl.hidden = false;
        summaryEl.textContent = hasAutoApplyPause
            ? 'Auto Apply is paused. Answer below, then tap Save & fill.'
            : displayFields.length === 1
              ? '1 question still needs your answer.'
              : `${displayFields.length} questions still need your answers.`;

        for (const field of displayFields) {
            listEl.appendChild(
                createPendingFieldCard(
                    field,
                    pauseContext,
                    displayFields.length,
                ),
            );
        }

        if (pauseContext?.blockerField?.ref) {
            const blockerCard = listEl.querySelector(
                `[data-ref="${CSS.escape(pauseContext.blockerField.ref)}"]`,
            );
            const blockerInput = blockerCard?.querySelector(
                '.pending-field-input',
            );

            if (blockerInput instanceof HTMLElement) {
                blockerInput.focus();
            }
        }
    }

    function createPendingFieldCard(
        field,
        pauseContext,
        pendingFieldCount = 1,
    ) {
        const card = document.createElement('article');
        card.className = 'pending-field-card postbox-panel';
        card.dataset.ref = field.ref;

        const displayLabel = resolveAutoApplyPendingFieldDisplayLabel(
            field,
            pauseContext,
            {
                pendingFieldCount,
            },
        );

        if (displayLabel) {
            const question = document.createElement('p');
            question.className = 'pending-field-question';
            question.textContent = displayLabel;
            card.appendChild(question);
        }

        const hint = document.createElement('p');
        hint.className = 'postbox-hint pending-field-hint';

        const autoApplyHint = resolveAutoApplyPendingFieldHint(
            field,
            pauseContext,
        );

        if (autoApplyHint) {
            hint.textContent = autoApplyHint;
        } else if (field.pending_hint) {
            hint.textContent = String(field.pending_hint);
        } else if (field.reason === 'type_coherence') {
            const rejected = String(field.rejected_answer || '').trim();
            const why = String(field.reject_reason || 'type mismatch').trim();
            hint.textContent = rejected
                ? `Skipped incoherent draft (${why}): "${rejected.slice(0, 80)}${rejected.length > 80 ? '…' : ''}". Enter the correct answer.`
                : `Skipped incoherent draft (${why}). Enter the correct answer.`;
        } else if (
            field.reason === 'validation_error' &&
            field.validationMessage
        ) {
            hint.textContent = `Validation error: ${field.validationMessage}`;
        } else if (field.profile_path) {
            hint.textContent = field.profile_label
                ? `Saved to your profile as ${field.profile_label.toLowerCase()}.`
                : 'Saved to your profile when you submit.';
        } else {
            hint.textContent =
                'Saved to Application Q&A on your dashboard for future forms.';
        }

        const input = document.createElement(
            field.field_type === 'textarea' ? 'textarea' : 'input',
        );
        input.className = 'postbox-input pending-field-input';
        input.placeholder = 'Your answer…';

        if (input instanceof HTMLTextAreaElement) {
            input.rows = 3;
        }

        const actions = document.createElement('div');
        actions.className = 'pending-field-actions';

        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'postbox-btn-outline pending-field-reject-btn';
        rejectBtn.textContent = 'Not for profile';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'postbox-btn pending-field-save-btn';
        saveBtn.textContent = 'Save & fill';

        rejectBtn.addEventListener('click', async () => {
            if (savingRef) {
                return;
            }

            savingRef = field.ref;
            rejectBtn.disabled = true;
            saveBtn.disabled = true;
            rejectBtn.textContent = 'Dismissing…';

            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'DISMISS_PENDING_FIELD',
                    field,
                });

                if (response?.error) {
                    throw new Error(response.error);
                }

                fields = response.fields || [];
                render();
            } catch (error) {
                showMessage(error.message, 'error');
                rejectBtn.disabled = false;
                saveBtn.disabled = false;
                rejectBtn.textContent = 'Not for profile';
            } finally {
                savingRef = null;
            }
        });

        saveBtn.addEventListener('click', async () => {
            const answer = input.value.trim();

            if (!answer) {
                showMessage('Enter an answer first.', 'error');

                return;
            }

            if (savingRef) {
                return;
            }

            savingRef = field.ref;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'SAVE_PENDING_FIELD_ANSWER',
                    field,
                    answer,
                });

                if (response?.error) {
                    throw new Error(response.error);
                }

                if (response?.validationRetry) {
                    await refreshPendingFields();
                } else {
                    fields = response.fields || [];
                    render();
                }

                showMessage(
                    response.applied
                        ? 'Answer saved and filled.'
                        : 'Answer saved to your profile.',
                    'success',
                );
            } catch (error) {
                showMessage(error.message, 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & fill';
            } finally {
                savingRef = null;
            }
        });

        actions.appendChild(rejectBtn);
        actions.appendChild(saveBtn);
        card.appendChild(hint);
        card.appendChild(input);
        card.appendChild(actions);

        return card;
    }

    async function refreshPendingFields() {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_PENDING_FIELDS',
        });

        if (response?.error) {
            throw new Error(response.error);
        }

        fields = response.fields || [];
        render();
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (
            message.type === 'PENDING_FIELDS_UPDATED' ||
            message.type === 'DRAFT_ALL_DONE' ||
            message.type === 'AUTO_APPLY_PAUSED'
        ) {
            void refreshPendingFields().catch(() => {});
        }
    });

    return { refreshPendingFields, renderPendingFields: render };
}
