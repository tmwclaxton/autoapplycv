import assert from 'node:assert/strict';
import { buildDraftCoverLetterText } from '../../extension/src/shared/cover-letter-draft.js';

const cases = [
    {
        name: 'uses why / experience / fit structure with Yours faithfully',
        run() {
            const text = buildDraftCoverLetterText(
                {
                    full_name: 'James Mitchell',
                    headline: 'Senior Laravel Developer',
                    experience: [
                        {
                            title: 'Senior Software Engineer',
                            company: 'Riverbank Systems',
                            highlights: [
                                'Led migration of monolith to Laravel microservices serving 40k daily users',
                            ],
                        },
                    ],
                },
                {
                    title: 'Senior Laravel Developer',
                    company: 'Northwind Labs',
                },
            );

            assert.match(text, /^Dear Hiring Manager,\n\n/);
            assert.match(text, /I am applying for the Senior Laravel Developer role at Northwind Labs/);
            assert.match(text, /As Senior Software Engineer at Riverbank Systems, I led migration/);
            assert.match(text, /help Northwind Labs/);
            assert.match(text, /Yours faithfully,\nJames Mitchell$/);
            assert.equal(text.includes('james.mitchell@example.com'), false);
        },
    },
    {
        name: 'uses named greeting and Yours sincerely',
        run() {
            const text = buildDraftCoverLetterText(
                { full_name: 'Alex Morgan', experience: [] },
                {
                    title: 'Engineer',
                    company: 'Acme',
                    hiring_manager: 'Sam Lee',
                },
            );

            assert.match(text, /^Dear Sam Lee,\n\n/);
            assert.match(text, /Yours sincerely,\nAlex Morgan$/);
        },
    },
];

let failed = 0;

for (const testCase of cases) {
    try {
        testCase.run();
        console.log(`ok - ${testCase.name}`);
    } catch (error) {
        failed += 1;
        console.error(`not ok - ${testCase.name}`);
        console.error(error);
    }
}

if (failed > 0) {
    process.exit(1);
}

console.log(`\n${cases.length} cover letter draft checks passed.`);
