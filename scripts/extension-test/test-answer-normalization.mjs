#!/usr/bin/env node
import {
    isYearsExperienceQuestion,
    capitalizeFreeTextAnswer,
    normalizeFieldAnswerForQuestion,
    normalizeYearsExperienceAnswer,
} from '../../extension/src/shared/answer-normalization.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const azureLabel = 'How many years of work experience do you have with Microsoft Azure?';

assert(isYearsExperienceQuestion(azureLabel), 'azure years label should match');
assert(
    !isYearsExperienceQuestion('Why are you interested in this role?'),
    'open-ended motivation questions should not match',
);

assert(
    normalizeYearsExperienceAnswer('5') === '5',
    'plain integer should stay unchanged',
);
assert(
    normalizeYearsExperienceAnswer('5 years') === '5',
    'years suffix should be stripped',
);
assert(
    normalizeYearsExperienceAnswer('1 year of azure') === '1',
    'embedded years phrase should extract integer',
);
assert(
    normalizeYearsExperienceAnswer('I have about 8 years of Azure experience') === '8',
    'embedded years in sentence should extract integer',
);
assert(
    normalizeYearsExperienceAnswer('120 years') === '99',
    'values above 99 should clamp to 99',
);
assert(
    normalizeYearsExperienceAnswer('', { profileYears: '6' }) === '6',
    'empty answer should fall back to profile years',
);

assert(
    normalizeFieldAnswerForQuestion(azureLabel, '3 years') === '3',
    'field normalization should coerce years questions',
);
assert(
    normalizeFieldAnswerForQuestion('Notice period', '2 weeks') === '2 weeks',
    'non-years questions should remain unchanged',
);

assert(
    capitalizeFreeTextAnswer('no') === 'No',
    'textarea answers should capitalize first letter',
);
assert(
    normalizeFieldAnswerForQuestion('Will you require sponsorship?', 'no', { fieldType: 'textarea' }) === 'No',
    'textarea field type should sentence-case answers',
);
assert(
    normalizeFieldAnswerForQuestion('Will you require sponsorship?', 'no', { fieldType: 'text' }) === 'no',
    'plain text fields should not auto-capitalize',
);
assert(
    capitalizeFreeTextAnswer('yes, I can start immediately. notice period is two weeks.') === 'Yes, I can start immediately. Notice period is two weeks.',
    'sentence boundaries should capitalize the next word',
);

console.log('answer-normalization tests passed');
