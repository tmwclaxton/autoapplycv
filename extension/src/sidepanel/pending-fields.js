import { dedupeQuestionLabelForDisplay } from './pending-fields.js';

export function initPendingFieldsPanel({ showMessage }) {
    const sectionEl = document.getElementById('pending-fields-section');
    const listEl = document.getElementById('pending-fields-list');
    const summaryEl = document.getElementById('pending-fields-summary');

    if (!sectionEl || !listEl) {
        return { refreshPendingFields: async () => {} };
    }

    let fields = [];
    let savingRef = null;

    function render() {
        listEl.innerHTML = '';

        if (fields.length === 0) {
            sectionEl.hidden = true;
            summaryEl.textContent = '';

            return;
        }

        sectionEl.hidden = false;
        summaryEl.textContent = fields.length === 1
            ? '1 question still needs your answer.'
            : `${fields.length} questions still need your answers.`;

        for (const field of fields) {
            listEl.appendChild(createPendingFieldCard(field));
        }
    }

    function createPendingFieldCard(field) {
        const card = document.createElement('article');
        card.className = 'pending-field-card postbox-panel';
        card.dataset.ref = field.ref;

        const displayLabel = dedupeQuestionLabelForDisplay(field.question || field.label || '');

        const question = document.createElement('p');
        question.className = 'pending-field-question';
        question.textContent = displayLabel || field.question || field.label;

        const hint = document.createElement('p');
        hint.className = 'postbox-hint pending-field-hint';

        if (field.profile_path) {
            hint.textContent = field.profile_label
                ? `Saved to your profile as ${field.profile_label.toLowerCase()}.`
                : 'Saved to your profile when you submit.';
        } else {
            hint.textContent = 'Saved to Application Q&A on your dashboard for future forms.';
        }

        const input = document.createElement(field.field_type === 'textarea' ? 'textarea' : 'input');
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

                fields = response.fields || [];
                render();
                showMessage(response.applied ? 'Answer saved and filled.' : 'Answer saved to your profile.', 'success');
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
        card.appendChild(question);
        card.appendChild(hint);
        card.appendChild(input);
        card.appendChild(actions);

        return card;
    }

    async function refreshPendingFields() {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_FIELDS' });

        if (response?.error) {
            throw new Error(response.error);
        }

        fields = response.fields || [];
        render();
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'PENDING_FIELDS_UPDATED' || message.type === 'DRAFT_ALL_DONE') {
            void refreshPendingFields().catch(() => {});
        }
    });

    return { refreshPendingFields };
}
