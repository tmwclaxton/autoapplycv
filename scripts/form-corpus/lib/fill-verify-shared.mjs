export function normalizeOption(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

export function optionMatchesAnswer(optionText, answer) {
    const option = normalizeOption(optionText);
    const normalizedAnswer = normalizeOption(answer);

    if (!option || !normalizedAnswer) {
        return false;
    }

    if (option === normalizedAnswer || option.includes(normalizedAnswer) || normalizedAnswer.includes(option)) {
        return true;
    }

    if (normalizedAnswer === 'yes') {
        return /^yes\b/.test(option) || option.includes('i am open') || option.includes('i can start');
    }

    if (normalizedAnswer === 'no') {
        return /^no\b/.test(option) || option.includes('not open') || option.includes('i am not');
    }

    return false;
}
