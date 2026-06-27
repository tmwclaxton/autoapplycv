export function initAssistChat({ showMessage, refreshUsage, buildJobPayload }) {
    const messagesEl = document.getElementById('assist-messages');
    const inputEl = document.getElementById('assist-input');
    const sendBtn = document.getElementById('assist-send-btn');
    const chatHistory = [];

    function appendMessage(role, content, extras = {}, options = {}) {
        const recordHistory = options.recordHistory !== false;

        if (recordHistory) {
            chatHistory.push({ role, content });
        }

        const bubble = document.createElement('div');
        bubble.className = `assist-message assist-message-${role}`;

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = content;
        bubble.appendChild(text);

        if (extras.draftAnswer) {
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'postbox-btn-outline assist-inline-btn';
            copyBtn.textContent = 'Copy draft answer';
            copyBtn.addEventListener('click', async () => {
                await navigator.clipboard.writeText(extras.draftAnswer);
                showMessage('Draft answer copied.', 'success');
            });
            bubble.appendChild(copyBtn);
        }

        if (Array.isArray(extras.profileUpdates) && extras.profileUpdates.length > 0) {
            extras.profileUpdates.forEach((update) => {
                const card = document.createElement('div');
                card.className = 'assist-update-card postbox-panel';

                const label = document.createElement('p');
                label.className = 'postbox-label';
                label.textContent = update.label;
                card.appendChild(label);

                const value = document.createElement('p');
                value.className = 'assist-update-value';
                value.textContent = update.value;
                card.appendChild(value);

                if (update.reason) {
                    const reason = document.createElement('p');
                    reason.className = 'postbox-hint';
                    reason.textContent = update.reason;
                    card.appendChild(reason);
                }

                const actions = document.createElement('div');
                actions.className = 'assist-update-actions';

                const approveBtn = document.createElement('button');
                approveBtn.type = 'button';
                approveBtn.className = 'postbox-btn assist-approve-btn';
                approveBtn.textContent = 'Apply change';

                const dismissBtn = document.createElement('button');
                dismissBtn.type = 'button';
                dismissBtn.className = 'postbox-btn-outline assist-dismiss-btn';
                dismissBtn.textContent = 'Dismiss';

                actions.appendChild(approveBtn);
                actions.appendChild(dismissBtn);
                card.appendChild(actions);

                approveBtn.addEventListener('click', async () => {
                    approveBtn.disabled = true;

                    const response = await chrome.runtime.sendMessage({
                        type: 'APPLY_PROFILE_UPDATE',
                        update,
                    });

                    if (response?.error) {
                        showMessage(response.error, 'error');
                        approveBtn.disabled = false;

                        return;
                    }

                    card.remove();
                    showMessage('Profile updated.', 'success');
                    await refreshUsage();
                });

                dismissBtn.addEventListener('click', () => {
                    card.remove();
                });

                bubble.appendChild(card);
            });
        }

        messagesEl.appendChild(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function sendMessage() {
        const content = inputEl.value.trim();

        if (!content) {
            return;
        }

        appendMessage('user', content);
        inputEl.value = '';
        sendBtn.disabled = true;
        sendBtn.textContent = 'Thinking…';

        try {
            let focusedField = null;

            try {
                ({ focusedField } = await chrome.storage.session.get(['focusedField']));
            } catch {
                focusedField = null;
            }

            const response = await chrome.runtime.sendMessage({
                type: 'ASSIST_CHAT',
                messages: chatHistory,
                job: buildJobPayload(),
                focused_field: focusedField || null,
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            if (response?.success === false) {
                throw new Error(response.error || 'Could not respond right now. Try again shortly.');
            }

            if (!response?.message) {
                throw new Error('Could not respond right now. Try again shortly.');
            }

            appendMessage('assistant', response.message, {
                draftAnswer: response.draft_answer,
                profileUpdates: response.profile_updates,
            });
            await refreshUsage();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
            inputEl.focus();
        }
    }

    sendBtn.addEventListener('click', () => {
        void sendMessage();
    });

    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
        }
    });

    appendMessage(
        'assistant',
        'Ask me to draft an application answer, improve your profile, or explain what to put in a field. I can suggest profile changes for you to approve.',
        {},
        { recordHistory: false },
    );

    return { appendMessage };
}
