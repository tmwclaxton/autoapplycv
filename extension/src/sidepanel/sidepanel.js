import { getProfileFromApi, patchProfile } from './draft-all-stream.js';

const messageEl = document.getElementById('message');
const usagePill = document.getElementById('usage-pill');
const focusedFieldEl = document.getElementById('focused-field');
const draftStatusEl = document.getElementById('draft-status');
const aiStatusEl = document.getElementById('ai-status');
const aiOutputEl = document.getElementById('ai-output');

function showMessage(text, tone = '') {
    messageEl.textContent = text;
    messageEl.className = `message ${tone}`.trim();
}

function buildJobPayload() {
    return {
        title: document.getElementById('ai-job-title').value.trim() || null,
        company: document.getElementById('ai-job-company').value.trim() || null,
        description: document.getElementById('ai-job-description').value.trim(),
    };
}

function validateJobDescription(description) {
    if (description.length < 40) {
        throw new Error('Paste a job description (40+ characters).');
    }
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

async function runAssist(type, payload) {
    aiStatusEl.textContent = 'Working…';

    const response = await chrome.runtime.sendMessage({ type, ...payload });

    if (response?.error) {
        throw new Error(response.error);
    }

    await refreshProfileFields();

    return response;
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

document.getElementById('ai-ats-btn').addEventListener('click', async () => {
    try {
        const job = buildJobPayload();
        validateJobDescription(job.description);

        const response = await runAssist('ASSIST_ATS', {
            job_description: job.description,
        });

        aiOutputEl.value = `ATS score: ${response.result.score}%\n\nMatched: ${response.result.matched_keywords.join(', ')}\n\nMissing: ${response.result.missing_keywords.join(', ')}\n\nSuggestions:\n- ${response.result.suggestions.join('\n- ')}`;
        aiStatusEl.textContent = 'ATS score ready.';
        showMessage('ATS score ready.', 'success');
    } catch (error) {
        aiStatusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('ai-cover-letter-btn').addEventListener('click', async () => {
    try {
        const job = buildJobPayload();
        validateJobDescription(job.description);

        const response = await runAssist('ASSIST_COVER_LETTER', {
            job,
            tone: 'professional',
        });

        aiOutputEl.value = response.cover_letter;
        aiStatusEl.textContent = 'Cover letter generated.';
        showMessage('Cover letter generated.', 'success');
    } catch (error) {
        aiStatusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('ai-resume-btn').addEventListener('click', async () => {
    try {
        const job = buildJobPayload();
        validateJobDescription(job.description);
        const template = document.getElementById('ai-resume-template').value;

        const response = await runAssist('ASSIST_TAILORED_RESUME', {
            job,
            template,
        });

        aiOutputEl.value = response.resume;
        aiStatusEl.textContent = 'Tailored resume generated.';
        showMessage('Tailored resume generated.', 'success');
    } catch (error) {
        aiStatusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('ai-copy-btn').addEventListener('click', async () => {
    if (!aiOutputEl.value.trim()) {
        showMessage('Nothing to copy yet.', 'error');

        return;
    }

    await navigator.clipboard.writeText(aiOutputEl.value);
    showMessage('Copied to clipboard.', 'success');
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
