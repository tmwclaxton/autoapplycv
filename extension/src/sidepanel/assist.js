import { parseDirectProfileUpdateActions } from './direct-profile-update.js';

const WELCOME_MESSAGE =
    'Ask me to draft an application answer, improve your profile, or explain what to put in a field. To update profile fields directly, say something like "update my location to Bristol" — an Apply button will appear on the reply.';

export function initAssistChat({ showMessage, refreshUsage, buildJobPayload, getApiBase }) {
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

    function buildDashboardUrl(tab, anchor) {
        const apiBase = typeof getApiBase === 'function' ? getApiBase() : null;

        if (!apiBase) {
            return null;
        }

        const url = new URL('/dashboard', apiBase);

        if (tab) {
            url.searchParams.set('tab', tab);
        }

        if (anchor) {
            url.hash = anchor.startsWith('#') ? anchor : `#${anchor}`;
        }

        return url.toString();
    }

    function truncateTagValue(value, maxLength = 36) {
        const text = String(value || '').trim();

        if (text.length <= maxLength) {
            return text;
        }

        return `${text.slice(0, maxLength - 1)}…`;
    }

    function formatActionValue(value) {
        if (Array.isArray(value)) {
            return `(${value.length} items)`;
        }

        const text = String(value ?? '').trim();

        return text === '' ? '(clear)' : truncateTagValue(text);
    }

    function renderActionTags(bubble, actions = []) {
        if (!bubble || !Array.isArray(actions) || actions.length === 0) {
            return;
        }

        const contentBox = bubble.querySelector('.assist-message-content');

        if (!contentBox) {
            return;
        }

        contentBox.querySelector('.assist-action-tags')?.remove();

        const container = document.createElement('div');
        container.className = 'assist-action-tags';

        actions.forEach((action) => {
            if (action?.type === 'profile_update') {
                container.appendChild(createProfileUpdateTag(action));
            } else if (action?.type === 'copy_draft') {
                container.appendChild(createCopyDraftTag(action));
            }
        });

        if (container.childElementCount === 0) {
            return;
        }

        contentBox.appendChild(container);
        scrollMessagesToBottom();
    }

    function createCopyDraftTag(action) {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'assist-action-tag assist-action-tag-draft';
        tag.textContent = 'Copy draft answer';

        tag.addEventListener('click', async () => {
            await navigator.clipboard.writeText(action.value);
            tag.classList.add('is-applied');
            tag.textContent = 'Draft copied';
            showMessage('Draft answer copied.', 'success');
        });

        return tag;
    }

    function createProfileUpdateTag(action) {
        const tag = document.createElement('span');
        tag.className = 'assist-action-tag assist-action-tag-profile';

        const label = document.createElement('span');
        label.className = 'assist-action-tag-label';
        label.textContent = `${action.label} → ${formatActionValue(action.value)}`;

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'assist-action-tag-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.title = 'Apply this profile change';

        const viewLink = document.createElement('a');
        viewLink.className = 'assist-action-tag-btn assist-action-tag-link';
        viewLink.textContent = 'View';
        viewLink.target = '_blank';
        viewLink.rel = 'noopener noreferrer';

        const dashboardUrl = buildDashboardUrl(
            action.dashboard_tab || 'profile',
            action.dashboard_anchor || '',
        );

        if (dashboardUrl) {
            viewLink.href = dashboardUrl;
        } else {
            viewLink.addEventListener('click', (event) => {
                event.preventDefault();
                showMessage('Connect AutoCVApply to open your dashboard.', 'error');
            });
        }

        tag.appendChild(label);
        tag.appendChild(applyBtn);
        tag.appendChild(viewLink);

        applyBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            applyBtn.disabled = true;

            const response = await chrome.runtime.sendMessage({
                type: 'APPLY_PROFILE_UPDATE',
                update: action,
            });

            if (response?.error) {
                showMessage(response.error, 'error');
                applyBtn.disabled = false;

                return;
            }

            tag.classList.add('is-applied');
            label.textContent = `Updated ${action.label.toLowerCase()}`;
            applyBtn.remove();
            showMessage('Profile updated.', 'success');
            await refreshUsage();
        });

        return tag;
    }

    function createAssistantBubble(content = '') {
        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-assistant';

        const contentBox = document.createElement('div');
        contentBox.className = 'assist-message-content';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = content;

        contentBox.appendChild(text);
        bubble.appendChild(contentBox);

        return { bubble, text, contentBox };
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
        renderActionTags(bubble, extras.actions || buildActionsFromExtras(extras));

        messagesEl.appendChild(bubble);
        scrollMessagesToBottom();

        return { bubble, text };
    }

    function buildActionsFromExtras(extras = {}) {
        const actions = Array.isArray(extras.actions) ? [...extras.actions] : [];

        if (Array.isArray(extras.profileUpdates)) {
            extras.profileUpdates.forEach((update) => {
                actions.push({
                    type: 'profile_update',
                    ...update,
                });
            });
        }

        if (extras.draftAnswer) {
            actions.push({
                type: 'copy_draft',
                label: 'Draft answer',
                value: extras.draftAnswer,
            });
        }

        return actions;
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

        const contentBox = document.createElement('div');
        contentBox.className = 'assist-message-content';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = '';
        contentBox.appendChild(text);
        bubble.appendChild(contentBox);

        messagesEl.appendChild(bubble);
        scrollMessagesToBottom();

        return { bubble, text, contentBox };
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

        renderActionTags(
            streamMessage.bubble,
            extras.actions || buildActionsFromExtras(extras),
        );
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

        const lastUserEntry = [...chatHistory].reverse().find((entry) => entry.role === 'user');
        const directActions = lastUserEntry
            ? parseDirectProfileUpdateActions(lastUserEntry.content)
            : [];

        let streamMessage = beginAssistantStream();

        if (directActions.length > 0) {
            renderActionTags(streamMessage.bubble, directActions);
        }

        let completed = false;
        let streamedActions = directActions.length > 0 ? directActions : null;

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

                    if (event.type === 'tools' && Array.isArray(event.actions)) {
                        streamedActions = event.actions;
                        renderActionTags(streamMessage.bubble, event.actions);

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
                actions:
                    streamedActions
                    ?? result.actions
                    ?? (directActions.length > 0
                        ? directActions
                        : buildActionsFromExtras({
                            profileUpdates: result.profile_updates,
                            draftAnswer: result.draft_answer,
                        })),
                finalMessage: result.message,
            });
            streamMessage = null;
            await refreshUsage();
        } catch (error) {
            if (streamMessage) {
                removeDomAfter(streamMessage.bubble, true);
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
