import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGeneratedCoverLetterText } from '../../extension/src/shared/auto-apply-cover-letter.js';

const job = {
    title: 'Graphic Designer & Videographer',
    company: 'Auxato Limited',
};
const profileData = {
    profile: {
        full_name: 'Example Candidate',
        email: 'candidate@example.com',
        phone: '+1 202 555 0147',
        experience: [
            {
                title: 'Senior Visual Designer',
                company: 'Northstar Studio',
            },
        ],
    },
};

test('generic saved cover-letter copy is not accepted as generated success', () => {
    const result = validateGeneratedCoverLetterText({
        text: 'I have just viewed your job vacancy for your job vacancy and would like to be considered for this position. Please find a copy of my CV attached. Example Candidate.',
        job,
        profileData,
    });

    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes('too_short'));
    assert.ok(result.reasons.includes('missing_role'));
    assert.ok(result.reasons.includes('missing_company'));
    assert.ok(result.reasons.includes('repetitive_generic_phrase'));
    assert.ok(result.reasons.includes('missing_profile_evidence'));
});

test('role and company-specific grounded cover-letter copy passes', () => {
    const result = validateGeneratedCoverLetterText({
        text: `Dear Hiring Manager,

I am applying for the Graphic Designer and Videographer role at Auxato Limited because the mix of social design, short-form video and brand development matches the work I most enjoy. The chance to carry ideas from an initial brief through to polished print and digital output is especially relevant to my background.

As Senior Visual Designer at Northstar Studio, I produced campaign assets, edited video for social channels and worked directly with account teams to turn client feedback into clear visual work. I also built pitch decks and reusable brand systems, balancing fast deadlines with consistent detail across formats. That practical combination maps well to your need for someone comfortable moving between design, photography and video.

I would bring a collaborative approach, strong visual judgement and experience adapting creative work for different audiences and channels. I would welcome the opportunity to discuss how I could help your team deliver distinctive client work.

Yours faithfully,
Example Candidate`,
        job,
        profileData,
    });

    assert.deepEqual(result.reasons, []);
    assert.equal(result.valid, true);
    assert.ok(result.text.includes('Graphic Designer and Videographer'));
    assert.ok(result.text.includes(job.company));
});
