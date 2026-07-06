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

    function isInvalidExtensionUrl(url) {
        if (!url) {
            return true;
        }

        const urlString = String(url);

        if (urlString.includes('chrome-extension://invalid')) {
            return true;
        }

        try {
            const parsed = new URL(urlString);

            return parsed.protocol === 'chrome-extension:' && parsed.hostname === 'invalid';
        } catch {
            return false;
        }
    }

    function isExtensionContextValid() {
        if (contextInvalidated) {
            return false;
        }

        try {
            if (!chrome?.runtime?.id) {
                return false;
            }

            const probeUrl = chrome.runtime.getURL('');

            if (isInvalidExtensionUrl(probeUrl)) {
                markContextInvalidated();

                return false;
            }

            return true;
        } catch {
            markContextInvalidated();

            return false;
        }
    }

    function safeRuntimeGetURL(path) {
        if (contextInvalidated || !isExtensionContextValid()) {
            return null;
        }

        try {
            const url = chrome.runtime.getURL(path);

            if (isInvalidExtensionUrl(url)) {
                markContextInvalidated();

                return null;
            }

            return url;
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            return null;
        }
    }

    async function safeFetch(url, init) {
        const urlString = String(url ?? '');

        if (isInvalidExtensionUrl(urlString)) {
            markContextInvalidated();

            throw new Error('Extension context invalidated.');
        }

        if (contextInvalidated || !isExtensionContextValid()) {
            throw new Error('Extension context invalidated.');
        }

        try {
            return await fetch(url, init);
        } catch (error) {
            if (isInvalidatedError(error)) {
                markContextInvalidated();
            }

            throw error;
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
        isInvalidExtensionUrl,
        markContextInvalidated,
        safeFetch,
        safeRuntimeGetURL,
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
