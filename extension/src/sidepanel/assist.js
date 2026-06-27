const WELCOME_MESSAGE =
    'Ask me to draft an application answer, improve your profile, or explain what to put in a field. I can suggest profile changes for you to approve.';

export function initAssistChat({ showMessage, refreshUsage, buildJobPayload }) {
    const messagesEl = document.getElementById('assist-messages');
    const messagesScrollEl = document.getElementById('assist-messages-scroll');
    const inputEl = document.getElementById('assist-input');
    const sendBtn = document.getElementById('assist-send-btn');
    const clearBtn = document.getElementById('assist-clear-btn');
    const chatHistory = [];
    let activeStreamPort = null;
    let requestInProgress = false;

    function scrollMessagesToBottom() {
        if (!messagesScrollEl) {
            return;
        }

        messagesScrollEl.scrollTop = messagesScrollEl.scrollHeight;
    }

    function setRequestInProgress(inProgress) {
        requestInProgress = inProgress;
        sendBtn.disabled = inProgress;
        sendBtn.textContent = inProgress ? 'Thinking…' : 'Send';

        messagesEl.querySelectorAll('.assist-user-action-btn').forEach((button) => {
            button.disabled = inProgress;
        });
    }

    function appendExtras(bubble, extras = {}) {
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
    }

    function createAssistantBubble(content = '') {
        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-assistant';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = content;
        bubble.appendChild(text);

        return { bubble, text };
    }

    function createUserActionButtons(userBubble, historyIndex) {
        const actions = document.createElement('div');
        actions.className = 'assist-user-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'postbox-btn-outline assist-user-action-btn assist-user-edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
            if (requestInProgress) {
                return;
            }

            editUserMessage(userBubble, historyIndex);
        });

        const redoBtn = document.createElement('button');
        redoBtn.type = 'button';
        redoBtn.className = 'postbox-btn-outline assist-user-action-btn assist-user-redo-btn';
        redoBtn.textContent = 'Redo';
        redoBtn.addEventListener('click', () => {
            if (requestInProgress) {
                return;
            }

            void redoUserMessage(userBubble, historyIndex);
        });

        actions.appendChild(editBtn);
        actions.appendChild(redoBtn);

        return actions;
    }

    function appendUserMessage(content) {
        const historyIndex = chatHistory.length;
        chatHistory.push({ role: 'user', content });

        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-user';
        bubble.dataset.historyIndex = String(historyIndex);

        const inner = document.createElement('div');
        inner.className = 'assist-message-user-inner';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = content;

        inner.appendChild(text);
        inner.appendChild(createUserActionButtons(bubble, historyIndex));
        bubble.appendChild(inner);

        messagesEl.appendChild(bubble);
        scrollMessagesToBottom();

        return { bubble, text, historyIndex };
    }

    function appendMessage(role, content, extras = {}, options = {}) {
        const recordHistory = options.recordHistory !== false;

        if (role === 'user') {
            if (recordHistory) {
                return appendUserMessage(content);
            }

            const bubble = document.createElement('div');
            bubble.className = 'assist-message assist-message-user';

            const text = document.createElement('div');
            text.className = 'assist-message-text';
            text.textContent = content;
            bubble.appendChild(text);

            messagesEl.appendChild(bubble);
            scrollMessagesToBottom();

            return { bubble, text };
        }

        if (recordHistory) {
            chatHistory.push({ role: 'assistant', content });
        }

        const { bubble, text } = createAssistantBubble(content);
        appendExtras(bubble, extras);

        messagesEl.appendChild(bubble);
        scrollMessagesToBottom();

        return { bubble, text };
    }

    function appendWelcomeMessage() {
        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-assistant assist-message-welcome';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = WELCOME_MESSAGE;
        bubble.appendChild(text);

        messagesEl.appendChild(bubble);
    }

    function removeDomAfter(bubble, inclusive = false) {
        if (inclusive) {
            let node = bubble;

            while (node) {
                const next = node.nextElementSibling;
                node.remove();
                node = next;
            }

            return;
        }

        let node = bubble.nextElementSibling;

        while (node) {
            const next = node.nextElementSibling;
            node.remove();
            node = next;
        }
    }

    function editUserMessage(userBubble, historyIndex) {
        const entry = chatHistory[historyIndex];

        if (!entry || entry.role !== 'user') {
            return;
        }

        closeActiveStreamPort();
        chatHistory.splice(historyIndex);
        removeDomAfter(userBubble, true);
        inputEl.value = entry.content;
        inputEl.focus();
    }

    async function redoUserMessage(userBubble, historyIndex) {
        const entry = chatHistory[historyIndex];

        if (!entry || entry.role !== 'user') {
            return;
        }

        closeActiveStreamPort();
        chatHistory.splice(historyIndex + 1);
        removeDomAfter(userBubble, false);

        await requestAssistantReply();
    }

    function clearChat() {
        closeActiveStreamPort();
        chatHistory.length = 0;
        messagesEl.innerHTML = '';
        appendWelcomeMessage();
        inputEl.value = '';
        setRequestInProgress(false);
        inputEl.focus();
    }

    function beginAssistantStream() {
        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-assistant is-streaming';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = '';
        bubble.appendChild(text);

        messagesEl.appendChild(bubble);
        scrollMessagesToBottom();

        return { bubble, text };
    }

    function appendStreamToken(streamMessage, delta) {
        streamMessage.text.textContent += delta;
        scrollMessagesToBottom();
    }

    function finalizeAssistantStream(streamMessage, extras = {}) {
        streamMessage.bubble.classList.remove('is-streaming');

        if (typeof extras.finalMessage === 'string' && extras.finalMessage.trim() !== '') {
            streamMessage.text.textContent = extras.finalMessage;
        }

        const content = streamMessage.text.textContent.trim();

        if (content !== '') {
            chatHistory.push({ role: 'assistant', content });
        }

        appendExtras(streamMessage.bubble, extras);
        scrollMessagesToBottom();
    }

    function closeActiveStreamPort() {
        if (activeStreamPort) {
            activeStreamPort.disconnect();
            activeStreamPort = null;
        }
    }

    async function requestAssistantReply() {
        if (chatHistory.length === 0 || requestInProgress) {
            return;
        }

        setRequestInProgress(true);
        closeActiveStreamPort();

        let streamMessage = beginAssistantStream();
        let completed = false;

        try {
            let focusedField = null;

            try {
                ({ focusedField } = await chrome.storage.session.get(['focusedField']));
            } catch {
                focusedField = null;
            }

            const port = chrome.runtime.connect({ name: 'assist-chat-stream' });
            activeStreamPort = port;

            const result = await new Promise((resolve, reject) => {
                port.onMessage.addListener((event) => {
                    if (event.type === 'token' && typeof event.delta === 'string') {
                        appendStreamToken(streamMessage, event.delta);

                        return;
                    }

                    if (event.type === 'complete') {
                        completed = true;
                        resolve(event);

                        return;
                    }

                    if (event.type === 'usage') {
                        void refreshUsage();

                        return;
                    }

                    if (event.type === 'error') {
                        reject(new Error(event.message || 'Could not respond right now. Try again shortly.'));
                    }
                });

                port.onDisconnect.addListener(() => {
                    if (!completed) {
                        reject(new Error('Connection lost before the response finished.'));
                    }
                });

                port.postMessage({
                    type: 'START',
                    messages: chatHistory,
                    job: buildJobPayload(),
                    focused_field: focusedField || null,
                });
            });

            finalizeAssistantStream(streamMessage, {
                draftAnswer: result.draft_answer,
                profileUpdates: result.profile_updates,
                finalMessage: result.message,
            });
            streamMessage = null;
            await refreshUsage();
        } catch (error) {
            if (streamMessage) {
                streamMessage.bubble.remove();
            }

            showMessage(error.message, 'error');
        } finally {
            closeActiveStreamPort();
            setRequestInProgress(false);
            inputEl.focus();
        }
    }

    async function sendMessage() {
        const content = inputEl.value.trim();

        if (!content || requestInProgress) {
            return;
        }

        appendUserMessage(content);
        inputEl.value = '';
        await requestAssistantReply();
    }

    sendBtn.addEventListener('click', () => {
        void sendMessage();
    });

    clearBtn?.addEventListener('click', () => {
        clearChat();
    });

    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
        }
    });

    appendWelcomeMessage();

    return { appendMessage, clearChat };
}
