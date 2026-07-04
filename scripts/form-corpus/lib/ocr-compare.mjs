/**
 * Normalize OCR text for fuzzy substring checks (spacing, punctuation, case).
 *
 * @param {string} text
 */
export function normalizeOcr(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9@.+/-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {string} haystack
 * @param {string} needle
 */
export function ocrContains(haystack, needle) {
    const normalizedHaystack = normalizeOcr(haystack);
    const normalizedNeedle = normalizeOcr(needle);

    if (normalizedNeedle === '') {
        return false;
    }

    return normalizedHaystack.includes(normalizedNeedle);
}

/**
 * @param {string} text
 */
export function tokenizeOcr(text) {
    return normalizeOcr(text)
        .split(/[\s@./_|-]+/)
        .filter((token) => token.length >= 4);
}

/**
 * @param {string} beforeText
 * @param {string} afterText
 * @param {string} expected
 */
export function expectationNewlyVisible(beforeText, afterText, expected) {
    if (ocrContains(afterText, expected) && !ocrContains(beforeText, expected)) {
        return true;
    }

    const expectedTokens = tokenizeOcr(expected).filter((token) => token.length >= 4);

    if (expectedTokens.length === 0) {
        return false;
    }

    const beforeTokens = new Set(tokenizeOcr(beforeText));
    const afterTokens = new Set(tokenizeOcr(afterText));

    return expectedTokens.some((token) => afterTokens.has(token) && !beforeTokens.has(token));
}

/**
 * @param {string} beforeText
 * @param {string} afterText
 * @param {string[]} expectedNewStrings
 */
export function compareOcrFill(beforeText, afterText, expectedNewStrings) {
    const results = expectedNewStrings.map((expected) => {
        const inBefore = ocrContains(beforeText, expected);
        const inAfter = ocrContains(afterText, expected);
        const newlyVisible = expectationNewlyVisible(beforeText, afterText, expected);

        return {
            expected,
            inBefore,
            inAfter,
            passed: newlyVisible,
        };
    });

    const passed = results.every((result) => result.passed);
    const summary = results
        .map((result) => `${result.expected}: before=${result.inBefore} after=${result.inAfter} passed=${result.passed}`)
        .join('\n');

    return {
        passed,
        results,
        summary,
        diff: {
            onlyInAfter: normalizeOcr(afterText)
                .split(' ')
                .filter((token) => token.length > 3 && !normalizeOcr(beforeText).includes(token))
                .slice(0, 40),
        },
    };
}
