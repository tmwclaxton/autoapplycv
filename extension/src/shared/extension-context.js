/**
 * Guards against "Extension context invalidated" after extension reload.
 */
const AutoCVApplyExtensionContext = (() => {
    let contextInvalidated = false;

    function isInvalidatedError(error) {
        const message = error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : String(error ?? '');

        return /invalidated/i.test(message);
    }

    function markContextInvalidated() {
        contextInvalidated = true;
    }

    function isExtensionContextValid() {
        if (contextInvalidated) {
            return false;
        }

        try {
            return Boolean(chrome?.runtime?.id);
        } catch {
            markContextInvalidated();

            return false;
        }
    }

    function safeRuntimeSend(message) {
        if (contextInvalidated || !isExtensionContextValid()) {
            return Promise.resolve(null);
        }

        try {
            const result = chrome.runtime.sendMessage(message);

            if (result && typeof result.then === 'function') {
                return result.catch((error) => {
                    if (isInvalidatedError(error)) {
                        markContextInvalidated();
                    }

                    return null;
                });
            }

            return Promise.resolve(null);
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            return Promise.resolve(null);
        }
    }

    function safeRuntimeSendCallback(message, callback) {
        if (contextInvalidated || !isExtensionContextValid()) {
            callback?.(null);

            return;
        }

        try {
            chrome.runtime.sendMessage(message, (response) => {
                try {
                    if (chrome.runtime.lastError) {
                        if (/invalidated/i.test(chrome.runtime.lastError.message || '')) {
                            markContextInvalidated();
                        }

                        callback?.(null);

                        return;
                    }

                    callback?.(response);
                } catch (error) {
                    if (isInvalidatedError(error)) {
                        markContextInvalidated();
                    }

                    callback?.(null);
                }
            });
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            callback?.(null);
        }
    }

    async function safeStorageSessionSet(items) {
        if (contextInvalidated || !isExtensionContextValid()) {
            return false;
        }

        try {
            await chrome.storage.session.set(items);

            return true;
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            return false;
        }
    }

    async function safeStorageSessionRemove(keys) {
        if (contextInvalidated || !isExtensionContextValid()) {
            return false;
        }

        try {
            await chrome.storage.session.remove(keys);

            return true;
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            return false;
        }
    }

    function safeOnMessageAddListener(listener) {
        if (contextInvalidated || !isExtensionContextValid()) {
            return false;
        }

        try {
            chrome.runtime.onMessage.addListener(listener);

            return true;
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            return false;
        }
    }

    return {
        isExtensionContextValid,
        markContextInvalidated,
        safeRuntimeSend,
        safeRuntimeSendCallback,
        safeStorageSessionSet,
        safeStorageSessionRemove,
        safeOnMessageAddListener,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyExtensionContext = AutoCVApplyExtensionContext;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyExtensionContext = AutoCVApplyExtensionContext;
}
