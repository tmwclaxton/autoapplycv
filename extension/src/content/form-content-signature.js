/**
 * Content-script bridge for form content signature helpers (shared with background/tests).
 */
const AutoCVApplyFormContentSignature = (() => {
    function computeFormContentSignature(rootDocument) {
        const doc = rootDocument || document;
        const heading = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '';
        const form = doc.querySelector('form');

        return `${heading}|${form?.querySelectorAll('input, textarea, select').length || 0}|${form?.textContent?.length || 0}`;
    }

    return { computeFormContentSignature };
})();
