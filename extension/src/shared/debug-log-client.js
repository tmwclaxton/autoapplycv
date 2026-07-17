/**
 * Content-script debug logger - forwards entries to the background ring buffer.
 */
var AutoCVApplyDebugLog = (() => {
    function send(level, source, phase, message, data, tabId) {
        const entry = {
            type: 'DEBUG_LOG',
            entry: {
                timestamp: new Date().toISOString(),
                level,
                source,
                phase,
                message,
                data,
                tabId: tabId ?? null,
            },
        };

        if (typeof AutoCVApplyExtensionContext !== 'undefined') {
            if (!AutoCVApplyExtensionContext.isExtensionContextValid()) {
                return;
            }

            AutoCVApplyExtensionContext.safeRuntimeSend(entry);

            return;
        }
    }

    return {
        logDebug(source, phase, message, data, tabId) {
            send('debug', source, phase, message, data, tabId);
        },
        logInfo(source, phase, message, data, tabId) {
            send('info', source, phase, message, data, tabId);
        },
        logWarn(source, phase, message, data, tabId) {
            send('warn', source, phase, message, data, tabId);
        },
        logError(source, phase, message, data, tabId) {
            send('error', source, phase, message, data, tabId);
        },
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyDebugLog = AutoCVApplyDebugLog;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyDebugLog = AutoCVApplyDebugLog;
}
