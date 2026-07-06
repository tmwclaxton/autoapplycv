import { buildDraftBatchChatHeading } from './draft-batch-chat.js';
import { polishProfileUpdateActions } from './profile-value-polish.js';

const WELCOME_MESSAGE =
    'Ask me to draft an application answer, improve your profile, or explain what to put in a field. When I suggest profile changes, Apply buttons will appear after my reply.';

export function initAssistChat({ showMessage, refreshUsage, buildJobPayload, getApiBase }) {
    const messagesEl = document.getElementById('assist-messages');
    const messagesScrollEl = document.getElementById('assist-messages-scroll');
    const inputEl = document.getElementById('assist-input');
    const sendBtn = document.getElementById('assist-send-btn');
    const clearBtn = document.getElementById('assist-clear-btn');
    const chatHistory = [];
    let activeStreamPort = null;
    let requestInProgress = false;
    /** @type {object|null} */
    let autoApplyPauseContext = null;

    function scrollMessagesToBottom() {
        if (!messagesScrollEl) {
            return;
        }

        messagesScrollEl.scrollTop = messagesScrollEl.scrollHeight;
    }

    function setRequestInProgress(inProgress, phase = 'thinking') {
        requestInProgress = inProgress;
        sendBtn.disabled = inProgress;
        sendBtn.textContent = inProgress
            ? (phase === 'preparing' ? 'Preparing…' : 'Thinking…')
            : 'Send';

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

    function readValueAtPath(profileData, path) {
        const parts = String(path || '').split('.').filter(Boolean);

        if (parts.length === 0) {
            return '';
        }

        if (parts[0] === 'application_settings') {
            let node = profileData.application_settings ?? {};

            for (let index = 1; index < parts.length; index += 1) {
                node = node?.[parts[index]];
            }

            return node ?? '';
        }

        let node = profileData.profile ?? profileData;

        for (const part of parts) {
            node = node?.[part];
        }

        if (node === null || node === undefined) {
            return '';
        }

        return node;
    }

    async function fetchProfileFieldValue(path) {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });

        if (response?.error) {
            throw new Error(response.error);
        }

        return readValueAtPath(response, path);
    }

    function clearAutoApplyPauseContext() {
        autoApplyPauseContext = null;
    }

    async function submitAutoApplyBlockerAnswer(answer) {
        const trimmed = String(answer || '').trim();

        if (!trimmed || !autoApplyPauseContext?.blockerField) {
            return false;
        }

        const response = await chrome.runtime.sendMessage({
            type: 'AUTO_APPLY_SUBMIT_BLOCKER_ANSWER',
            answer: trimmed,
            field: autoApplyPauseContext.blockerField,
        });

        if (response?.error) {
            throw new Error(response.error);
        }

        clearAutoApplyPauseContext();
        showMessage(response.applied ? 'Answer applied. Resuming Auto Apply…' : 'Answer saved. Resuming Auto Apply…', 'success');

        return true;
    }

    function extractDraftAnswerFromActions(actions = []) {
        for (const action of actions) {
            if (action?.type === 'copy_draft' && action.value) {
                return String(action.value).trim();
            }
        }

        return '';
    }

    function handleAutoApplyPaused(pauseContext) {
        autoApplyPauseContext = pauseContext || null;

        if (!pauseContext) {
            return;
        }

        const clarifyingQuestion = pauseContext.clarifyingQuestion
            || pauseContext.questionText
            || pauseContext.blockerField?.question
            || pauseContext.blockerField?.label
            || 'Which answer should Auto Apply use for this required field?';
        const fieldLabel = pauseContext.blockerField?.label || 'a required field';

        inputEl.value = '';
        inputEl.focus();
        scrollMessagesToBottom();

        appendMessage(
            'assistant',
            `${clarifyingQuestion}\n\n`
            + `Auto Apply paused on "${fieldLabel}". `
            + 'Send your answer here, or use Save & fill in the pending fields section above.',
            {},
            { recordHistory: false },
        );
    }

    async function maybeSubmitAutoApplyAnswerFromAssist(result, userContent) {
        if (!autoApplyPauseContext) {
            return;
        }

        const draftAnswer = result?.draft_answer
            || extractDraftAnswerFromActions(result?.actions || []);

        const clarifyingQuestion = String(autoApplyPauseContext.clarifyingQuestion
            || autoApplyPauseContext.questionText
            || '').trim();
        const directAnswer = userContent.startsWith('Auto Apply needs your help:')
            || (clarifyingQuestion !== '' && userContent === clarifyingQuestion)
            ? ''
            : userContent;

        const answer = draftAnswer || directAnswer;

        if (!answer) {
            return;
        }

        await submitAutoApplyBlockerAnswer(answer);
    }

    function createDraftAnswerCopyButton(answerText) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'assist-draft-answer-copy postbox-btn-outline';
        copyBtn.textContent = 'Copy';

        copyBtn.addEventListener('click', async () => {
            copyBtn.disabled = true;

            try {
                await navigator.clipboard.writeText(answerText);
                copyBtn.classList.add('is-copied');
                copyBtn.textContent = 'Copied';
                showMessage('Answer copied.', 'success');
            } catch (error) {
                showMessage(error.message || 'Could not copy answer.', 'error');
                copyBtn.disabled = false;
            }
        });

        return copyBtn;
    }

    const ASSIST_COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const ASSIST_COPIED_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    function createAssistantCopyButton(getText) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'assist-message-copy-btn';
        copyBtn.setAttribute('aria-label', 'Copy response');
        copyBtn.title = 'Copy response';
        copyBtn.innerHTML = ASSIST_COPY_ICON;

        let resetTimer = null;

        copyBtn.addEventListener('click', async () => {
            const text = typeof getText === 'function' ? getText() : String(getText ?? '');
            const trimmed = text.trim();

            if (trimmed === '') {
                return;
            }

            copyBtn.disabled = true;

            if (resetTimer) {
                clearTimeout(resetTimer);
                resetTimer = null;
            }

            try {
                await navigator.clipboard.writeText(trimmed);
                copyBtn.classList.add('is-copied');
                copyBtn.innerHTML = ASSIST_COPIED_ICON;
                copyBtn.setAttribute('aria-label', 'Copied');
                showMessage('Copied to clipboard.', 'success');

                resetTimer = setTimeout(() => {
                    copyBtn.classList.remove('is-copied');
                    copyBtn.innerHTML = ASSIST_COPY_ICON;
                    copyBtn.setAttribute('aria-label', 'Copy response');
                    copyBtn.disabled = false;
                    resetTimer = null;
                }, 2000);
            } catch (error) {
                showMessage(error.message || 'Could not copy response.', 'error');
                copyBtn.disabled = false;
            }
        });

        return copyBtn;
    }

    function appendAssistantBubbleShell(contentBox, getCopyText) {
        const inner = document.createElement('div');
        inner.className = 'assist-message-assistant-inner';

        inner.appendChild(contentBox);
        inner.appendChild(createAssistantCopyButton(getCopyText));

        return inner;
    }

    function appendDraftBatchAnswers({ batchNumber = 1, answers = [] } = {}) {
        const entries = Array.isArray(answers)
            ? answers.filter((entry) => entry?.label && entry?.answer)
            : [];

        if (entries.length === 0) {
            return;
        }

        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-assistant assist-message-draft-batch';

        const contentBox = document.createElement('div');
        contentBox.className = 'assist-message-content';

        const header = document.createElement('div');
        header.className = 'assist-draft-batch-header';
        header.textContent = buildDraftBatchChatHeading(batchNumber, entries.length);

        const hint = document.createElement('div');
        hint.className = 'assist-draft-batch-hint';
        hint.textContent = 'Copy any answer below if autofill missed a field.';

        const list = document.createElement('div');
        list.className = 'assist-draft-batch-list';

        entries.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'assist-draft-answer';

            const label = document.createElement('div');
            label.className = 'assist-draft-answer-label';
            label.textContent = entry.label;

            const answerText = document.createElement('div');
            answerText.className = 'assist-draft-answer-text';
            answerText.textContent = entry.answer;

            const actions = document.createElement('div');
            actions.className = 'assist-draft-answer-actions';
            actions.appendChild(createDraftAnswerCopyButton(entry.answer));

            item.appendChild(label);
            item.appendChild(answerText);
            item.appendChild(actions);
            list.appendChild(item);
        });

        contentBox.appendChild(header);
        contentBox.appendChild(hint);
        contentBox.appendChild(list);

        bubble.appendChild(appendAssistantBubbleShell(contentBox, () => {
            return entries
                .map((entry) => `${entry.label}\n${entry.answer}`)
                .join('\n\n');
        }));

        messagesEl.appendChild(bubble);
        scrollMessagesToBottom();
    }

    function createProfileApplyButton(tag, action, label, viewLink) {
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'assist-action-tag-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.title = 'Apply this profile change';

        applyBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            applyBtn.disabled = true;

            try {
                const previousValue = await fetchProfileFieldValue(action.path || action.field);
                await applyProfileUpdateAction(action);
                markProfileTagApplied(tag, action, previousValue, label, viewLink);
                showMessage('Profile updated.', 'success');
                await refreshUsage();
            } catch (error) {
                showMessage(error.message, 'error');
                applyBtn.disabled = false;
            }
        });

        return applyBtn;
    }

    function createProfileUndoButton(tag, action, label, viewLink, previousValue) {
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'assist-action-tag-btn assist-action-tag-undo';
        undoBtn.textContent = 'Undo';
        undoBtn.title = 'Restore your previous profile value';

        undoBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            undoBtn.disabled = true;

            try {
                await applyProfileUpdateAction({
                    ...action,
                    value: previousValue ?? '',
                });
                restoreProfileTagPending(tag, action, label, viewLink);
                showMessage('Change undone.', 'success');
                await refreshUsage();
            } catch (error) {
                showMessage(error.message, 'error');
                undoBtn.disabled = false;
            }
        });

        return undoBtn;
    }

    function markProfileTagApplied(tag, action, previousValue, label, viewLink) {
        tag.classList.add('is-applied');
        tag.dataset.previousValue = JSON.stringify(previousValue ?? '');

        if (label) {
            label.textContent = `Updated ${action.label.toLowerCase()}`;
        }

        tag.querySelector('.assist-action-tag-btn:not(.assist-action-tag-link):not(.assist-action-tag-undo)')?.remove();

        if (!tag.querySelector('.assist-action-tag-undo')) {
            tag.insertBefore(createProfileUndoButton(tag, action, label, viewLink, previousValue), viewLink);
        }
    }

    function restoreProfileTagPending(tag, action, label, viewLink) {
        tag.classList.remove('is-applied');
        delete tag.dataset.previousValue;

        if (label) {
            label.textContent = `${action.label} → ${formatActionValue(action.value)}`;
        }

        tag.querySelector('.assist-action-tag-undo')?.remove();

        if (!tag.querySelector('.assist-action-tag-btn:not(.assist-action-tag-link)')) {
            tag.insertBefore(createProfileApplyButton(tag, action, label, viewLink), viewLink);
        }
    }

    async function applyProfileUpdateAction(action) {
        const response = await chrome.runtime.sendMessage({
            type: 'APPLY_PROFILE_UPDATE',
            update: action,
        });

        if (response?.error) {
            throw new Error(response.error);
        }

        return response;
    }

    function createApplyAllButton(profileTagRefs) {
        const pendingRefs = () => profileTagRefs.filter(({ tag }) => !tag.classList.contains('is-applied'));

        const applyAllBtn = document.createElement('button');
        applyAllBtn.type = 'button';
        applyAllBtn.className = 'assist-action-apply-all';
        applyAllBtn.textContent = 'Apply all';
        applyAllBtn.title = 'Apply every profile change below';

        applyAllBtn.addEventListener('click', async (event) => {
            event.stopPropagation();

            const refs = pendingRefs();

            if (refs.length === 0) {
                return;
            }

            applyAllBtn.disabled = true;

            try {
                const previousValues = await Promise.all(
                    refs.map(({ action }) => fetchProfileFieldValue(action.path || action.field)),
                );

                for (let index = 0; index < refs.length; index += 1) {
                    const { action, tag } = refs[index];
                    await applyProfileUpdateAction(action);
                    markProfileTagApplied(
                        tag,
                        action,
                        previousValues[index],
                        tag.querySelector('.assist-action-tag-label'),
                        tag.querySelector('.assist-action-tag-link'),
                    );
                }

                applyAllBtn.classList.add('is-applied');
                applyAllBtn.textContent = 'All applied';
                showMessage('Profile updated.', 'success');
                await refreshUsage();
            } catch (error) {
                showMessage(error.message, 'error');
                applyAllBtn.disabled = pendingRefs().length === 0;
            }
        });

        return applyAllBtn;
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

        const profileActions = actions.filter((action) => action?.type === 'profile_update');
        const otherActions = actions.filter((action) => action?.type !== 'profile_update');

        if (profileActions.length === 0 && otherActions.length === 0) {
            return;
        }

        const polishedActions = polishProfileUpdateActions([
            ...profileActions,
            ...otherActions,
        ]);
        const polishedProfileActions = polishedActions.filter((action) => action?.type === 'profile_update');
        const polishedOtherActions = polishedActions.filter((action) => action?.type !== 'profile_update');

        const container = document.createElement('div');
        container.className = 'assist-action-tags';

        const divider = document.createElement('hr');
        divider.className = 'assist-action-divider';
        container.appendChild(divider);

        if (polishedProfileActions.length >= 2) {
            const profileTagRefs = polishedProfileActions.map((action) => ({
                action,
                tag: createProfileUpdateTag(action),
            }));

            container.appendChild(createApplyAllButton(profileTagRefs));

            const tagsList = document.createElement('div');
            tagsList.className = 'assist-action-tags-list';

            profileTagRefs.forEach(({ tag }) => {
                tagsList.appendChild(tag);
            });

            polishedOtherActions.forEach((action) => {
                if (action?.type === 'copy_draft') {
                    tagsList.appendChild(createCopyDraftTag(action));
                }
            });

            container.appendChild(tagsList);
        } else {
            const tagsList = document.createElement('div');
            tagsList.className = 'assist-action-tags-list';

            polishedActions.forEach((action) => {
                if (action?.type === 'profile_update') {
                    tagsList.appendChild(createProfileUpdateTag(action));
                } else if (action?.type === 'copy_draft') {
                    tagsList.appendChild(createCopyDraftTag(action));
                }
            });

            container.appendChild(tagsList);
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
        tag.appendChild(createProfileApplyButton(tag, action, label, viewLink));
        tag.appendChild(viewLink);

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
        bubble.appendChild(appendAssistantBubbleShell(contentBox, () => text.textContent));

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
                    path: update.path,
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

    function resolveStreamActions(result) {
        if (Array.isArray(result.actions) && result.actions.length > 0) {
            return result.actions;
        }

        return buildActionsFromExtras({
            profileUpdates: result.profile_updates,
            draftAnswer: result.draft_answer,
        });
    }

    function appendWelcomeMessage() {
        const bubble = document.createElement('div');
        bubble.className = 'assist-message assist-message-assistant assist-message-welcome';

        const contentBox = document.createElement('div');
        contentBox.className = 'assist-message-content';

        const text = document.createElement('div');
        text.className = 'assist-message-text';
        text.textContent = WELCOME_MESSAGE;

        contentBox.appendChild(text);
        bubble.appendChild(appendAssistantBubbleShell(contentBox, () => text.textContent));

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
        bubble.appendChild(appendAssistantBubbleShell(contentBox, () => text.textContent));

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
        streamMessage.bubble.classList.remove('is-preparing');

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

                    if (event.type === 'processing') {
                        streamMessage.bubble.classList.remove('is-streaming');
                        streamMessage.bubble.classList.add('is-preparing');
                        setRequestInProgress(true, 'preparing');

                        return;
                    }

                    if (event.type === 'tools' && Array.isArray(event.actions) && event.actions.length > 0) {
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

            const resolvedActions = resolveStreamActions(result);

            finalizeAssistantStream(streamMessage, {
                actions: resolvedActions,
                finalMessage: result.message,
            });
            streamMessage = null;
            await maybeSubmitAutoApplyAnswerFromAssist(result, chatHistory[chatHistory.length - 2]?.content || '');
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

    return {
        appendMessage,
        appendDraftBatchAnswers,
        clearChat,
        handleAutoApplyPaused,
        clearAutoApplyPauseContext,
    };
}
