import { getProfileFromApi, patchProfile } from './draft-all-stream.js';

const messageEl = document.getElementById('message');
const usagePill = document.getElementById('usage-pill');
const focusedFieldEl = document.getElementById('focused-field');
const draftStatusEl = document.getElementById('draft-status');

function showMessage(text, tone = '') {
    messageEl.textContent = text;
    messageEl.className = `message ${tone}`.trim();
}

async function refreshProfileFields() {
    try {
        const data = await getProfileFromApi();
        const profile = data.profile || {};

        document.getElementById('profile-headline').value = profile.headline || '';
        document.getElementById('profile-summary').value = profile.summary || '';
        document.getElementById('profile-extra').value = profile.extra_context || '';
        document.getElementById('profile-phone').value = profile.phone || '';

        const sub = data.subscription;
        usagePill.textContent = sub ? `${sub.autofills_remaining} left` : 'Connected';
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function refreshFocusedField() {
    const { focusedField } = await chrome.storage.session.get(['focusedField']);

    if (!focusedField?.label) {
        focusedFieldEl.textContent = 'Click a form field to enable Quick Answer.';

        return;
    }

    focusedFieldEl.textContent = `Selected: ${focusedField.label}`;
}

document.getElementById('draft-all-btn').addEventListener('click', async () => {
    draftStatusEl.textContent = 'Starting draft-all…';

    const response = await chrome.runtime.sendMessage({ type: 'START_DRAFT_ALL' });

    if (response?.error) {
        draftStatusEl.textContent = response.error;
        showMessage(response.error, 'error');
    } else {
        draftStatusEl.textContent = response?.message || 'Draft-all started.';
        await refreshProfileFields();
    }
});

document.getElementById('quick-answer-btn').addEventListener('click', async () => {
    draftStatusEl.textContent = 'Generating Quick Answer…';

    try {
        const response = await chrome.runtime.sendMessage({ type: 'QUICK_ANSWER_FOCUSED' });

        if (response?.error) {
            throw new Error(response.error);
        }

        draftStatusEl.textContent = response?.message || 'Answer applied.';
        showMessage('Quick Answer applied.', 'success');
        await refreshProfileFields();
    } catch (error) {
        draftStatusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    try {
        await patchProfile({
            headline: document.getElementById('profile-headline').value.trim() || null,
            summary: document.getElementById('profile-summary').value.trim() || null,
            extra_context: document.getElementById('profile-extra').value.trim() || null,
            phone: document.getElementById('profile-phone').value.trim() || null,
        });

        showMessage('Profile saved.', 'success');
        await chrome.runtime.sendMessage({ type: 'PROFILE_UPDATED' });
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.focusedField) {
        refreshFocusedField();
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DRAFT_ALL_PROGRESS') {
        draftStatusEl.textContent = message.message || '';
    }

    if (message.type === 'DRAFT_ALL_DONE') {
        draftStatusEl.textContent = message.message || 'Done';
        refreshProfileFields();
    }
});

refreshProfileFields();
refreshFocusedField();
