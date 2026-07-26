/**
 * Unit tests for the free browser ATS keyword checker.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    extractKeywords,
    scoreAtsKeywordOverlap,
} from '../../resources/js/lib/atsKeywordChecker.ts';

describe('atsKeywordChecker', () => {
    it('extracts distinctive keywords from a job description', () => {
        const keywords = extractKeywords(
            'We need a Senior Python Engineer with AWS, Docker, and PostgreSQL. Leadership and communication matter.',
            15,
        );

        assert.ok(keywords.length > 0);
        assert.ok(
            keywords.some((k) => k.includes('python') || k === 'python'),
        );
        assert.ok(keywords.some((k) => k.includes('aws') || k === 'aws'));
    });

    it('scores higher when CV mirrors JD keywords', () => {
        const cv = `
Summary: Software engineer
Experience: Built services in Python on AWS with Docker and PostgreSQL.
Education: BSc Computer Science
Skills: Python, AWS, Docker, PostgreSQL, leadership, communication
Email: person@example.com
`;
        const jd =
            'Senior Python engineer required. Must know AWS, Docker, PostgreSQL. Leadership and communication skills essential.';

        const strong = scoreAtsKeywordOverlap(cv, jd);
        const weak = scoreAtsKeywordOverlap(
            'Waiter. Email: a@b.com. Experience hospitality.',
            jd,
        );

        assert.equal(strong.mode, 'job-match');
        assert.ok(strong.score > weak.score);
        assert.ok(strong.matchedKeywords.length > 0);
        assert.ok(strong.suggestions.length > 0);
    });

    it('supports profile-only mode without inventing job keywords', () => {
        const result = scoreAtsKeywordOverlap(
            'Profile\nExperience at Acme\nEducation University\nSkills Excel\nEmail me@example.com',
            '',
        );

        assert.equal(result.mode, 'profile-only');
        assert.equal(result.matchedKeywords.length, 0);
        assert.ok(result.score >= 0 && result.score <= 100);
        assert.ok(result.sectionsFound.length >= 2);
    });

    it('returns zero-ish guidance for tiny CV paste', () => {
        const result = scoreAtsKeywordOverlap('hi', 'python aws');
        assert.equal(result.score, 0);
        assert.ok(result.suggestions[0]?.includes('Paste more'));
    });
});
