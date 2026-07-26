/**
 * Browser-side keyword overlap estimate for the free ATS score checker.
 *
 * This is NOT the same as the authenticated NanoGPT ATS score in the extension
 * (5 credits). Label results as a keyword/completeness estimate.
 */

const STOPWORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'you',
    'your',
    'we',
    'our',
    'they',
    'their',
    'he',
    'she',
    'his',
    'her',
    'them',
    'i',
    'me',
    'my',
    'who',
    'whom',
    'which',
    'what',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'about',
    'into',
    'over',
    'after',
    'before',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'also',
    'able',
    'using',
    'used',
    'use',
    'including',
    'include',
    'across',
    'within',
    'via',
    'per',
    'role',
    'roles',
    'job',
    'jobs',
    'team',
    'teams',
    'work',
    'working',
    'experience',
    'experiences',
    'required',
    'requirements',
    'preferred',
    'preference',
    'responsibilities',
    'responsibility',
    'opportunity',
    'opportunities',
    'company',
    'candidate',
    'candidates',
    'please',
    'looking',
    'ensure',
    'strong',
    'good',
    'etc',
]);

const SECTION_PATTERNS: Array<{ id: string; label: string; pattern: RegExp }> =
    [
        {
            id: 'contact',
            label: 'Contact details',
            pattern: /@|phone|mobile|linkedin\.com|github\.com/i,
        },
        {
            id: 'experience',
            label: 'Experience / work history',
            pattern:
                /\b(experience|employment|work history|professional experience|career)\b/i,
        },
        {
            id: 'education',
            label: 'Education',
            pattern: /\b(education|university|degree|bachelor|master|phd)\b/i,
        },
        {
            id: 'skills',
            label: 'Skills',
            pattern: /\b(skills|competencies|technologies|tech stack)\b/i,
        },
        {
            id: 'summary',
            label: 'Summary / profile',
            pattern: /\b(summary|profile|about me|objective)\b/i,
        },
    ];

export type AtsCheckerResult = {
    score: number;
    mode: 'job-match' | 'profile-only';
    matchedKeywords: string[];
    missingKeywords: string[];
    sectionsFound: string[];
    sectionsMissing: string[];
    suggestions: string[];
    keywordCoveragePercent: number;
    sectionScore: number;
};

export function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

export function tokenize(text: string): string[] {
    const normalized = text.toLowerCase().replace(/[^a-z0-9+.#\-\s]/g, ' ');

    return normalized
        .split(/\s+/)
        .map((token) =>
            token.replace(/^[-.]+|[-.]+$/g, '').replace(/^\++|\++$/g, ''),
        )
        .filter(
            (token) =>
                token.length >= 3 &&
                !STOPWORDS.has(token) &&
                !/^\d+$/.test(token),
        );
}

/**
 * Prefer distinctive JD terms: frequency-capped singles, plus useful bigrams.
 */
export function extractKeywords(text: string, limit = 30): string[] {
    const cleaned = normalizeWhitespace(text);

    if (cleaned === '') {
        return [];
    }

    const tokens = tokenize(cleaned);
    const counts = new Map<string, number>();

    for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    const phraseCounts = new Map<string, number>();

    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i] ?? '';
        const b = tokens[i + 1] ?? '';

        if (a === '' || b === '') {
            continue;
        }

        const phrase = `${a} ${b}`;
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }

    const ranked = [
        ...[...counts.entries()].map(([term, count]) => ({
            term,
            score: count * 5 + Math.min(term.length, 14),
        })),
        ...[...phraseCounts.entries()].map(([term, count]) => ({
            term,
            score: count * 2 + 4,
        })),
    ]
        .sort((a, b) => b.score - a.score)
        .map((row) => row.term);

    const unique: string[] = [];
    const seen = new Set<string>();

    for (const term of ranked) {
        if (seen.has(term)) {
            continue;
        }

        seen.add(term);
        unique.push(term);

        if (unique.length >= limit) {
            break;
        }
    }

    return unique;
}

export function analyzeSections(cvText: string): {
    found: string[];
    missing: string[];
    score: number;
} {
    const found: string[] = [];
    const missing: string[] = [];

    for (const section of SECTION_PATTERNS) {
        if (section.pattern.test(cvText)) {
            found.push(section.label);
        } else {
            missing.push(section.label);
        }
    }

    const score = Math.round((found.length / SECTION_PATTERNS.length) * 100);

    return { found, missing, score };
}

function cvContainsKeyword(cvLower: string, keyword: string): boolean {
    if (keyword.includes(' ')) {
        return cvLower.includes(keyword);
    }

    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(
        cvLower,
    );
}

function buildSuggestions(input: {
    mode: 'job-match' | 'profile-only';
    missingKeywords: string[];
    sectionsMissing: string[];
    cvText: string;
}): string[] {
    const suggestions: string[] = [];

    if (input.mode === 'job-match' && input.missingKeywords.length > 0) {
        const sample = input.missingKeywords.slice(0, 5).join(', ');
        suggestions.push(
            `Mirror important job-description terms where they match real experience (missing examples: ${sample}).`,
        );
    }

    for (const section of input.sectionsMissing.slice(0, 3)) {
        suggestions.push(
            `Add a clear ${section.toLowerCase()} section with a standard heading ATS parsers recognise.`,
        );
    }

    if (!/\d/.test(input.cvText)) {
        suggestions.push(
            'Add quantifiable achievements (numbers, %, £, timeframes) so bullets read as evidence, not duties.',
        );
    }

    if (input.cvText.length < 800) {
        suggestions.push(
            'Your CV text looks short for a full application - expand recent roles with concrete outcomes.',
        );
    }

    if (/\|/.test(input.cvText) || /\t\t/.test(input.cvText)) {
        suggestions.push(
            'Avoid multi-column or table-heavy layouts when exporting for ATS - prefer a single-column text-friendly PDF or DOCX.',
        );
    }

    suggestions.push(
        'Use standard headings (Experience, Education, Skills) and submit a text-based PDF or DOCX - not a scanned image.',
    );

    if (input.mode === 'job-match') {
        suggestions.push(
            'For a deeper AI ATS score against your saved profile, use AutoCVApply Assist in the extension (uses credits).',
        );
    } else {
        suggestions.push(
            'Paste a job description for a keyword-match estimate against that role, or upload your CV in AutoCVApply for the full AI score.',
        );
    }

    return [...new Set(suggestions)].slice(0, 8);
}

export function scoreAtsKeywordOverlap(
    cvText: string,
    jobDescription = '',
): AtsCheckerResult {
    const cv = normalizeWhitespace(cvText);
    const jd = normalizeWhitespace(jobDescription);
    const sections = analyzeSections(cv);

    if (cv.length < 40) {
        return {
            score: 0,
            mode: jd === '' ? 'profile-only' : 'job-match',
            matchedKeywords: [],
            missingKeywords: [],
            sectionsFound: sections.found,
            sectionsMissing: sections.missing,
            suggestions: [
                'Paste more of your CV (or a .txt export) so the checker has enough text to analyse.',
            ],
            keywordCoveragePercent: 0,
            sectionScore: sections.score,
        };
    }

    if (jd === '') {
        const lengthBonus = Math.min(25, Math.floor(cv.length / 200));
        const score = Math.max(
            0,
            Math.min(100, Math.round(sections.score * 0.75 + lengthBonus)),
        );

        return {
            score,
            mode: 'profile-only',
            matchedKeywords: [],
            missingKeywords: [],
            sectionsFound: sections.found,
            sectionsMissing: sections.missing,
            suggestions: buildSuggestions({
                mode: 'profile-only',
                missingKeywords: [],
                sectionsMissing: sections.missing,
                cvText: cv,
            }),
            keywordCoveragePercent: 0,
            sectionScore: sections.score,
        };
    }

    const keywords = extractKeywords(jd, 30);
    const cvLower = cv.toLowerCase();
    const matched: string[] = [];
    const missing: string[] = [];

    for (const keyword of keywords) {
        if (cvContainsKeyword(cvLower, keyword)) {
            matched.push(keyword);
        } else {
            missing.push(keyword);
        }
    }

    const keywordCoveragePercent =
        keywords.length === 0
            ? 0
            : Math.round((matched.length / keywords.length) * 100);

    const score = Math.max(
        0,
        Math.min(
            100,
            Math.round(keywordCoveragePercent * 0.8 + sections.score * 0.2),
        ),
    );

    return {
        score,
        mode: 'job-match',
        matchedKeywords: matched.slice(0, 20),
        missingKeywords: missing.slice(0, 20),
        sectionsFound: sections.found,
        sectionsMissing: sections.missing,
        suggestions: buildSuggestions({
            mode: 'job-match',
            missingKeywords: missing,
            sectionsMissing: sections.missing,
            cvText: cv,
        }),
        keywordCoveragePercent,
        sectionScore: sections.score,
    };
}
