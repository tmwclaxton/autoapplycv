/**
 * Guards against "Extension context invalidated" after extension reload.
 */
var AutoCVApplyExtensionContext = (() => {
    let contextInvalidated = false;
    let contextProbePassed = false;
    /** @type {Set<() => void>} */
    const invalidationCallbacks = new Set();

    function isInvalidatedError(error) {
        const message = error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : String(error ?? '');

        return /invalidated/i.test(message);
    }

    function isDisconnectError(message) {
        return /invalidated|receiving end does not exist|message port closed|extension context/i.test(message || '');
    }

    function onContextInvalidated(callback) {
        if (typeof callback !== 'function') {
            return () => {};
        }

        if (contextInvalidated) {
            try {
                callback();
            } catch {
                // Ignore teardown failures after invalidation.
            }

            return () => {};
        }

        invalidationCallbacks.add(callback);

        return () => {
            invalidationCallbacks.delete(callback);
        };
    }

    function runInvalidationCallbacks() {
        for (const callback of [...invalidationCallbacks]) {
            try {
                callback();
            } catch {
                // Ignore teardown failures after invalidation.
            }
        }

        invalidationCallbacks.clear();
    }

    function markContextInvalidated() {
        if (contextInvalidated) {
            return;
        }

        contextInvalidated = true;
        contextProbePassed = false;
        runInvalidationCallbacks();
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

    function probeExtensionContext() {
        if (!chrome?.runtime?.id) {
            markContextInvalidated();

            return false;
        }

        const probeUrl = chrome.runtime.getURL('');

        if (isInvalidExtensionUrl(probeUrl)) {
            markContextInvalidated();

            return false;
        }

        contextProbePassed = true;

        return true;
    }

    function isExtensionContextValid() {
        if (contextInvalidated) {
            return false;
        }

        if (contextProbePassed) {
            return true;
        }

        try {
            return probeExtensionContext();
        } catch {
            markContextInvalidated();

            return false;
        }
    }

    function safeRuntimeGetURL(path) {
        if (contextInvalidated) {
            return null;
        }

        if (!contextProbePassed && !probeExtensionContext()) {
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
        if (contextInvalidated) {
            return Promise.resolve(null);
        }

        if (!contextProbePassed && !probeExtensionContext()) {
            return Promise.resolve(null);
        }

        try {
            const result = chrome.runtime.sendMessage(message);

            if (result && typeof result.then === 'function') {
                return result.catch((error) => {
                    if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                        markContextInvalidated();
                    }

                    return null;
                });
            }

            return Promise.resolve(null);
        } catch (error) {
            if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                markContextInvalidated();
            }

            return Promise.resolve(null);
        }
    }

    function safeRuntimeSendCallback(message, callback) {
        if (contextInvalidated) {
            callback?.(null);

            return;
        }

        if (!contextProbePassed && !probeExtensionContext()) {
            callback?.(null);

            return;
        }

        try {
            chrome.runtime.sendMessage(message, (response) => {
                try {
                    if (chrome.runtime.lastError) {
                        if (isDisconnectError(chrome.runtime.lastError.message)) {
                            markContextInvalidated();
                        }

                        callback?.(null);

                        return;
                    }

                    callback?.(response);
                } catch (error) {
                    if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                        markContextInvalidated();
                    }

                    callback?.(null);
                }
            });
        } catch (error) {
            if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                markContextInvalidated();
            }

            callback?.(null);
        }
    }

    async function safeStorageSessionSet(items) {
        if (contextInvalidated) {
            return false;
        }

        if (!contextProbePassed && !probeExtensionContext()) {
            return false;
        }

        try {
            await chrome.storage.session.set(items);

            return true;
        } catch (error) {
            if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                markContextInvalidated();
            }

            return false;
        }
    }

    async function safeStorageSessionRemove(keys) {
        if (contextInvalidated) {
            return false;
        }

        if (!contextProbePassed && !probeExtensionContext()) {
            return false;
        }

        try {
            await chrome.storage.session.remove(keys);

            return true;
        } catch (error) {
            if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                markContextInvalidated();
            }

            return false;
        }
    }

    function safeOnMessageAddListener(listener) {
        if (contextInvalidated) {
            return false;
        }

        if (!contextProbePassed && !probeExtensionContext()) {
            return false;
        }

        try {
            chrome.runtime.onMessage.addListener(listener);

            return true;
        } catch (error) {
            if (isInvalidatedError(error) || isDisconnectError(error?.message)) {
                markContextInvalidated();
            }

            return false;
        }
    }

    return {
        isExtensionContextValid,
        isInvalidExtensionUrl,
        markContextInvalidated,
        onContextInvalidated,
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
