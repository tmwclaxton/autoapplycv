const IMMEDIATE_PATTERNS = [
    'immediate',
    'immediately',
    'now',
    'asap',
    'straight away',
    'right away',
    'none',
    'no notice',
    '0 days',
    '0 day',
    '0 weeks',
    '0 week',
];

function isImmediate(normalized: string): boolean {
    return IMMEDIATE_PATTERNS.some(
        (pattern) =>
            normalized === pattern || normalized.startsWith(`${pattern} `),
    );
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export function computeEarliestStart(
    noticePeriod: string | null | undefined,
    from: Date = new Date(),
): string | null {
    const normalized = String(noticePeriod ?? '')
        .trim()
        .toLowerCase();

    if (normalized === '') {
        return null;
    }

    const reference = new Date(
        from.getFullYear(),
        from.getMonth(),
        from.getDate(),
    );

    if (isImmediate(normalized)) {
        return 'Immediately';
    }

    const dayMatch = normalized.match(/(\d+)\s*(day|days|d)\b/);

    if (dayMatch) {
        reference.setDate(reference.getDate() + Number(dayMatch[1]));

        return formatDate(reference);
    }

    const weekMatch = normalized.match(/(\d+)\s*(week|weeks|wk|wks|w)\b/);

    if (weekMatch) {
        reference.setDate(reference.getDate() + Number(weekMatch[1]) * 7);

        return formatDate(reference);
    }

    const monthMatch = normalized.match(/(\d+)\s*(month|months|mo|mos)\b/);

    if (monthMatch) {
        reference.setMonth(reference.getMonth() + Number(monthMatch[1]));

        return formatDate(reference);
    }

    return null;
}
