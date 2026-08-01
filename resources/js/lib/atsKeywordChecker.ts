/**
 * Lightweight browser-side ATS keyword overlap (no LLM).
 */

const STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'have',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'we',
    'with',
    'you',
    'your',
    'must',
    'will',
    'our',
    'all',
    'can',
    'required',
    'need',
    'know',
    'skills',
    'skill',
    'experience',
    'work',
    'role',
    'job',
    'team',
    'using',
    'use',
]);

export type AtsKeywordOverlapMode = 'job-match' | 'profile-only';

export type AtsKeywordOverlapResult = {
    mode: AtsKeywordOverlapMode;
    score: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    suggestions: string[];
    sectionsFound: string[];
};

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9+#.\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text: string): string[] {
    return normalizeText(text)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Pull distinctive keywords from a job description (or any text).
 */
export function extractKeywords(text: string, limit = 20): string[] {
    const counts = new Map<string, number>();

    for (const token of tokenize(text)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, Math.max(1, limit))
        .map(([word]) => word);
}

function detectCvSections(cvText: string): string[] {
    const normalized = cvText.toLowerCase();
    const sections: string[] = [];

    if (/\b(summary|profile|about)\b/.test(normalized)) {
        sections.push('summary');
    }

    if (/\b(experience|employment|work history)\b/.test(normalized)) {
        sections.push('experience');
    }

    if (/\b(education|university|degree|bsc|msc)\b/.test(normalized)) {
        sections.push('education');
    }

    if (/\b(skills|technologies|stack)\b/.test(normalized)) {
        sections.push('skills');
    }

    if (/\b(email|@)\b/.test(normalized)) {
        sections.push('contact');
    }

    return sections;
}

function keywordInHaystack(keyword: string, haystack: string): boolean {
    const normalizedKeyword = normalizeText(keyword);
    const normalizedHaystack = normalizeText(haystack);

    if (!normalizedKeyword) {
        return false;
    }

    if (normalizedHaystack.includes(normalizedKeyword)) {
        return true;
    }

    if (normalizedKeyword.includes(' ')) {
        return normalizedHaystack.includes(normalizedKeyword);
    }

    const pattern = new RegExp(
        `(^|[\\s,.;/])${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s,.;/]|$)`,
    );

    return pattern.test(normalizedHaystack);
}

/**
 * Score CV keyword overlap against a job description, or profile-only structure check.
 */
export function scoreAtsKeywordOverlap(
    cvText: string,
    jobDescription = '',
): AtsKeywordOverlapResult {
    const cv = String(cvText ?? '').trim();
    const jd = String(jobDescription ?? '').trim();
    const sectionsFound = detectCvSections(cv);

    if (cv.length < 40) {
        return {
            mode: jd ? 'job-match' : 'profile-only',
            score: 0,
            matchedKeywords: [],
            missingKeywords: [],
            suggestions: [
                'Paste more of your CV (experience, skills, and education) for a useful score.',
            ],
            sectionsFound,
        };
    }

    if (!jd) {
        const sectionScore = Math.min(100, sectionsFound.length * 25);

        return {
            mode: 'profile-only',
            score: sectionScore,
            matchedKeywords: [],
            missingKeywords: [],
            suggestions: [
                'Add a job description to compare keyword overlap for a specific role.',
            ],
            sectionsFound,
        };
    }

    const keywords = extractKeywords(jd, 24);
    const matchedKeywords = keywords.filter((keyword) =>
        keywordInHaystack(keyword, cv),
    );
    const missingKeywords = keywords.filter(
        (keyword) => !keywordInHaystack(keyword, cv),
    );

    const score =
        keywords.length === 0
            ? 0
            : Math.round((matchedKeywords.length / keywords.length) * 100);

    const suggestions: string[] = [];

    if (missingKeywords.length > 0) {
        suggestions.push(
            `Where honest, weave missing keywords into experience or skills: ${missingKeywords.slice(0, 8).join(', ')}.`,
        );
    } else if (matchedKeywords.length > 0) {
        suggestions.push(
            'Strong keyword overlap - keep phrasing natural and tied to real achievements.',
        );
    } else {
        suggestions.push(
            'No strong keyword overlaps detected - tailor the CV to mirror the job description.',
        );
    }

    return {
        mode: 'job-match',
        score,
        matchedKeywords,
        missingKeywords,
        suggestions,
        sectionsFound,
    };
}
