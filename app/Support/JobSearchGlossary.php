<?php

namespace App\Support;

/**
 * Job-search glossary terms for the public /glossary page.
 *
 * Educational definitions plus AutoCVApply product terms. Soft CTAs only.
 */
class JobSearchGlossary
{
    /**
     * @return array<int, array{
     *     slug: string,
     *     term: string,
     *     letter: string,
     *     paragraphs: array<int, string>,
     *     related: array<int, array{label: string, href: string}>
     * }>
     */
    public static function terms(): array
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return [
            [
                'slug' => 'ats',
                'term' => 'ATS (Applicant Tracking System)',
                'letter' => 'A',
                'paragraphs' => [
                    'An Applicant Tracking System is software employers use to collect, sort, and rank job applications. When you apply on a company career page or many job boards, your CV usually lands in an ATS first. The system parses contact details, work history, education, and skills, then matches them against the job description.',
                    'Most large employers and many mid-size companies use an ATS. Formatting that is hard to parse (heavy graphics, unusual layouts, text in images) can hurt you before a human reads the file. Clear headings, standard section names, and keywords from the job description help both the ATS and the recruiter.',
                ],
                'related' => [
                    ['label' => 'How AutoCVApply autofills ATS forms', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'auto-apply',
                'term' => 'Auto Apply',
                'letter' => 'A',
                'paragraphs' => [
                    'Auto Apply means using software to move through job applications faster - searching, opening roles, filling fields, and submitting - instead of retyping everything by hand. Tools differ: some only autofill fields; others run end-to-end on specific job boards.',
                    'In AutoCVApply, Auto Apply is a user-started session from the extension sidebar on supported boards (LinkedIn Easy Apply, Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, and Reed Easy Apply). You launch the run and can pause or review before submit. On ATS and employer career sites, AutoFill and Draft All fill fields - you still click Submit.',
                ],
                'related' => [
                    ['label' => 'How to run Auto Apply', 'href' => $site.'/how-to'],
                    ['label' => 'AutoCVApply vs AutoApplyMax', 'href' => $site.'/blog/autocvapply-vs-autoapplymax'],
                ],
            ],
            [
                'slug' => 'autofill',
                'term' => 'AutoFill',
                'letter' => 'A',
                'paragraphs' => [
                    'AutoFill is the AutoCVApply extension action that fills empty structured fields on an application page from your saved CV profile - name, contact, work history, education, and similar data.',
                    'It is built for repetitive ATS and career-site forms. You remain responsible for reviewing the page and submitting on those sites.',
                ],
                'related' => [
                    ['label' => 'Set up AutoFill', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'boolean-search',
                'term' => 'Boolean Search',
                'letter' => 'B',
                'paragraphs' => [
                    'Boolean search uses operators such as AND, OR, NOT, and quotation marks to combine or exclude keywords. Example: "project manager" AND (remote OR hybrid) NOT contract.',
                    'LinkedIn, Indeed, and many other boards support Boolean operators. Using them cuts noise and surfaces roles that match what you actually want.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'chrome-extension',
                'term' => 'Chrome Extension',
                'letter' => 'C',
                'paragraphs' => [
                    'A Chrome extension is a small program that adds features to Google Chrome. Job-search extensions can autofill forms, draft answers, track applications, or run Auto Apply workflows while you browse LinkedIn, Indeed, or employer sites.',
                    'AutoCVApply provides a Chrome extension (and a Firefox add-on) that connects to your uploaded CV profile with an API token from the dashboard.',
                ],
                'related' => [
                    ['label' => 'Install AutoCVApply', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'cold-email',
                'term' => 'Cold Email / Cold Outreach',
                'letter' => 'C',
                'paragraphs' => [
                    'Cold outreach means contacting a hiring manager, recruiter, or professional without a prior relationship - usually to open a conversation rather than only reply to a public posting.',
                    'Effective notes are short, specific to the company or role, and end with a clear ask (for example a brief call). Done well, outreach can reach roles that never appear on boards.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'cover-letter',
                'term' => 'Cover Letter',
                'letter' => 'C',
                'paragraphs' => [
                    'A cover letter is a short document sent with your CV that explains why you want the role and highlights the most relevant experience. Many hiring managers still use it to separate similar applications.',
                    'The strongest letters are tailored: a clear opening, concrete examples tied to the job description, and a confident close. AI can help draft, but you should edit for voice and accuracy.',
                ],
                'related' => [
                    ['label' => 'Pricing and cover-letter credits', 'href' => $site.'/pricing'],
                ],
            ],
            [
                'slug' => 'credits',
                'term' => 'Credits (AutoCVApply)',
                'letter' => 'C',
                'paragraphs' => [
                    'Credits are AutoCVApply\'s monthly allowance for extension AI actions such as Draft All, Assist replies, cover letters, and ATS scores. Exact costs appear in the extension.',
                    'CV upload and profile editing stay free on every plan. Free includes 1,500 credits per month; Starter and Pro raise the allowance. Allowances reset on the 1st.',
                ],
                'related' => [
                    ['label' => 'See pricing', 'href' => $site.'/pricing'],
                ],
            ],
            [
                'slug' => 'cv',
                'term' => 'CV (Curriculum Vitae)',
                'letter' => 'C',
                'paragraphs' => [
                    'In the UK and much of the world outside the US, CV usually means the document you send for a job - similar to what Americans call a resume. In US academia, a CV can mean a longer research-focused record.',
                    'AutoCVApply is built around uploading a PDF or Word CV once, turning it into an editable profile, then reusing that profile on applications.',
                ],
                'related' => [
                    ['label' => 'Upload your CV', 'href' => $site.'/login'],
                ],
            ],
            [
                'slug' => 'draft-all',
                'term' => 'Draft All',
                'letter' => 'D',
                'paragraphs' => [
                    'Draft All is AutoCVApply\'s AI action for unanswered free-text and screening questions. Answers should stay grounded in your saved profile rather than generic filler.',
                    'You review tone and facts before submit. Draft All uses extension credits.',
                ],
                'related' => [
                    ['label' => 'How Draft All works', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'easy-apply',
                'term' => 'Easy Apply',
                'letter' => 'E',
                'paragraphs' => [
                    'Easy Apply (notably on LinkedIn, and similarly named flows on other boards) lets you apply inside the platform with a stored profile and a few screening questions instead of a long external career-site form.',
                    'Lower friction means more applicants. Pair Easy Apply with a strong profile and targeted search. AutoCVApply can run user-started Auto Apply on LinkedIn Easy Apply and similar board flows.',
                ],
                'related' => [
                    ['label' => 'LinkedIn Auto Apply guide ideas on the blog', 'href' => $site.'/blog'],
                ],
            ],
            [
                'slug' => 'elevator-pitch',
                'term' => 'Elevator Pitch',
                'letter' => 'E',
                'paragraphs' => [
                    'An elevator pitch is a 30-to-60-second summary of who you are, what you do well, and what you are looking for. Use it at networking events, career fairs, and when interviews open with "Tell me about yourself."',
                    'Keep it natural, tailored to the listener, and end with space for a follow-up question.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'employee-referral',
                'term' => 'Employee Referral',
                'letter' => 'E',
                'paragraphs' => [
                    'An employee referral is when a current employee recommends you for a role. Many companies run formal referral programmes with bonuses for successful hires.',
                    'Referred candidates often move faster through screening. Building relationships at target companies increases your chance of a referral.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'ghosting',
                'term' => 'Ghosting (in Hiring)',
                'letter' => 'G',
                'paragraphs' => [
                    'Ghosting means communication stops without closure - often after an interview or even a verbal offer. It is common and frustrating on both sides of the market.',
                    'Follow up politely, keep several opportunities moving, and set personal deadlines so one silence does not freeze your whole search.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'headhunter',
                'term' => 'Headhunter / Executive Recruiter',
                'letter' => 'H',
                'paragraphs' => [
                    'A headhunter (executive recruiter) actively finds candidates for senior or hard-to-fill roles, often approaching people who are not openly job hunting.',
                    'They usually work for the employer and earn a fee on placement. Responding professionally can unlock roles you would not see on public boards.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'hidden-job-market',
                'term' => 'Hidden Job Market',
                'letter' => 'H',
                'paragraphs' => [
                    'The hidden job market covers roles filled through networking, referrals, internal moves, or direct outreach rather than public ads. Estimates vary widely, but a large share of hires never start as a job-board listing.',
                    'Supplement board applications with networking, informational interviews, and targeted outreach.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'hiring-manager',
                'term' => 'Hiring Manager',
                'letter' => 'H',
                'paragraphs' => [
                    'The hiring manager is the person who will manage the new hire and usually makes the final selection. Recruiters and HR often run logistics; the hiring manager owns the role needs.',
                    'Tailor your CV and examples to that team\'s problems when you can identify them.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'informational-interview',
                'term' => 'Informational Interview',
                'letter' => 'I',
                'paragraphs' => [
                    'An informational interview is a conversation you request to learn about a role, company, or industry - not a formal job interview. You ask about career paths, day-to-day work, and advice.',
                    'Keep it short (often 20-30 minutes), come prepared, and treat it as relationship-building rather than a hidden pitch for a job.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'indeed-apply',
                'term' => 'Indeed Apply',
                'letter' => 'I',
                'paragraphs' => [
                    'Indeed Apply is Indeed\'s in-platform application flow. Many listings let you apply with your Indeed profile and resume without leaving the board.',
                    'AutoCVApply supports user-started Auto Apply for Indeed Apply from the extension sidebar, alongside other UK-friendly boards.',
                ],
                'related' => [
                    ['label' => 'Supported Auto Apply boards', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'job-board',
                'term' => 'Job Board',
                'letter' => 'J',
                'paragraphs' => [
                    'A job board is a site where employers post roles and candidates search and apply. Examples include LinkedIn, Indeed, Totaljobs, Reed, Glassdoor, and niche boards for remote or sector-specific work.',
                    'Using several boards plus networking usually beats relying on one feed. AutoCVApply focuses Auto Apply on selected boards and AutoFill on ATS career sites.',
                ],
                'related' => [
                    ['label' => 'About AutoCVApply boards', 'href' => $site.'/about'],
                ],
            ],
            [
                'slug' => 'job-description',
                'term' => 'Job Description (JD)',
                'letter' => 'J',
                'paragraphs' => [
                    'A job description outlines responsibilities, required and preferred skills, experience, and sometimes salary or location. It is the main source of keywords for both ATS scoring and human screening.',
                    'Mirror important language naturally in your CV and cover letter when it matches real experience - avoid stuffing.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'keywords',
                'term' => 'Keywords (CV / Resume)',
                'letter' => 'K',
                'paragraphs' => [
                    'Keywords are the skills, tools, certifications, and phrases employers put in a JD and ATS systems look for. Categories include technical skills, soft skills, and industry terms.',
                    'Place them in context inside real achievements. Keyword stuffing looks bad to people and modern screens.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'linkedin-open-to-work',
                'term' => 'LinkedIn Open to Work',
                'letter' => 'L',
                'paragraphs' => [
                    'Open to Work lets you signal that you are looking for roles - publicly with a green banner, or privately to LinkedIn Recruiter users only.',
                    'Many people prefer recruiters-only. Either way, a strong headline, About section, and experience matter more than the banner alone.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'networking',
                'term' => 'Networking',
                'letter' => 'N',
                'paragraphs' => [
                    'Networking is building professional relationships that can lead to advice, referrals, and opportunities - in person or online.',
                    'Offer value before asking for favours. Start before you urgently need a job so conversations feel mutual rather than transactional.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'offer-letter',
                'term' => 'Offer Letter',
                'letter' => 'O',
                'paragraphs' => [
                    'An offer letter confirms title, pay, benefits, start date, and other terms after a verbal offer. Read it carefully before signing.',
                    'Most employers expect a short review window. Research market rates and negotiate respectfully when terms do not match your value.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'onboarding',
                'term' => 'Onboarding',
                'letter' => 'O',
                'paragraphs' => [
                    'Onboarding is how a company integrates a new hire - paperwork, tools, introductions, training, and early goals. It often starts before day one and continues for weeks.',
                    'Ask questions early, book one-to-ones, and seek feedback so you ramp faster.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'phone-screen',
                'term' => 'Phone Screen',
                'letter' => 'P',
                'paragraphs' => [
                    'A phone screen is usually a short first call with a recruiter to check fit, interest, logistics, and sometimes salary range.',
                    'Prepare like a real interview: know the JD, have concise examples ready, and sit somewhere quiet.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'portfolio',
                'term' => 'Portfolio',
                'letter' => 'P',
                'paragraphs' => [
                    'A portfolio is a curated set of work samples - common in design, writing, product, engineering (for example GitHub), and marketing.',
                    'Show the problem, your approach, and the outcome. Link it from your CV and LinkedIn.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'profile',
                'term' => 'Profile (AutoCVApply)',
                'letter' => 'P',
                'paragraphs' => [
                    'In AutoCVApply, your profile is the structured data created after you upload a CV - contact, experience, education, skills, and related fields you can edit in the dashboard.',
                    'AutoFill, Draft All, and Auto Apply all lean on that profile. Keep it accurate before a busy apply week.',
                ],
                'related' => [
                    ['label' => 'Upload and edit your profile', 'href' => $site.'/login'],
                ],
            ],
            [
                'slug' => 'recruiter',
                'term' => 'Recruiter',
                'letter' => 'R',
                'paragraphs' => [
                    'Recruiters find and screen candidates. Internal recruiters work for one employer; agency recruiters fill roles for clients.',
                    'Be clear about preferences and salary bands, reply promptly, and stay professional - a good impression can bring later roles even if one search ends.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'remote-work',
                'term' => 'Remote Work',
                'letter' => 'R',
                'paragraphs' => [
                    'Remote work means doing the job outside a traditional office - fully remote, hybrid, or remote-first with optional office access.',
                    'Use board filters, read location policies carefully, and be ready to show you can communicate and deliver without constant supervision.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'resume-tailoring',
                'term' => 'Resume / CV Tailoring',
                'letter' => 'R',
                'paragraphs' => [
                    'Tailoring means adjusting your CV for each application - summary, bullet emphasis, and keywords - so it matches the JD without inventing experience.',
                    'Tailored documents usually outperform a single generic file. A strong base profile (as in AutoCVApply) makes that editing faster.',
                ],
                'related' => [
                    ['label' => 'Start from one uploaded CV', 'href' => $site.'/login'],
                ],
            ],
            [
                'slug' => 'screening-questions',
                'term' => 'Screening Questions',
                'letter' => 'S',
                'paragraphs' => [
                    'Screening questions are application prompts used to filter candidates - work authorisation, relocation, salary, years of experience, certifications, and free-text "why this role" boxes.',
                    'Answer honestly. AutoCVApply can AutoFill structured answers from your profile and use Draft All for free-text screeners that you then review.',
                ],
                'related' => [
                    ['label' => 'Draft All for screeners', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'smartapply',
                'term' => 'SmartApply (Indeed)',
                'letter' => 'S',
                'paragraphs' => [
                    'SmartApply is Indeed\'s flow that pre-fills applications from your Indeed profile and resume so you review, answer employer questions, and submit faster.',
                    'Knowing the steps helps when you apply to many Indeed roles in one session.',
                ],
                'related' => [
                    ['label' => 'Indeed Auto Apply with AutoCVApply', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'star-method',
                'term' => 'STAR Method',
                'letter' => 'S',
                'paragraphs' => [
                    'STAR structures behavioural interview answers: Situation, Task, Action, Result. Prefer concrete actions and measurable outcomes.',
                    'Prepare a handful of STAR stories covering leadership, conflict, delivery, and teamwork so you are ready for "Tell me about a time..." questions.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'thank-you-note',
                'term' => 'Thank You Note',
                'letter' => 'T',
                'paragraphs' => [
                    'A thank-you note is a short email after an interview - usually within 24 hours - thanking the interviewer, restating interest, and referencing one specific point from the conversation.',
                    'It will not fix a weak interview, but it signals professionalism when candidates are close.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'totaljobs-quick-apply',
                'term' => 'Totaljobs Quick Apply',
                'letter' => 'T',
                'paragraphs' => [
                    'Totaljobs Quick Apply is Totaljobs\' streamlined apply flow for roles that support in-platform applications.',
                    'AutoCVApply includes Totaljobs Quick Apply in its user-started Auto Apply board coverage for UK seekers.',
                ],
                'related' => [
                    ['label' => 'UK boards Auto Apply', 'href' => $site.'/how-to'],
                ],
            ],
            [
                'slug' => 'transferable-skills',
                'term' => 'Transferable Skills',
                'letter' => 'T',
                'paragraphs' => [
                    'Transferable skills travel across jobs and industries - communication, project management, analysis, leadership, and adaptability.',
                    'Career changers and graduates should prove them with examples, not adjectives alone.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'work-life-balance',
                'term' => 'Work-Life Balance',
                'letter' => 'W',
                'paragraphs' => [
                    'Work-life balance is how sustainable the split is between work demands and the rest of life. Candidates often weigh it alongside pay and growth.',
                    'Look for flexible hours, remote options, leave policies, and review sites - and ask clear questions in interviews about expectations.',
                ],
                'related' => [],
            ],
            [
                'slug' => 'workday',
                'term' => 'Workday (Application Forms)',
                'letter' => 'W',
                'paragraphs' => [
                    'Workday is a common HR and ATS platform. Employer career sites built on Workday often ask for long, multi-step applications that repeat contact and history fields.',
                    'AutoCVApply AutoFill and Draft All are aimed at those repetitive forms. You still review and submit yourself on ATS sites.',
                ],
                'related' => [
                    ['label' => 'Autofill Workday-style forms', 'href' => $site.'/how-to'],
                ],
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function alphabet(): array
    {
        return range('A', 'Z');
    }

    /**
     * Letters that have at least one term.
     *
     * @return array<int, string>
     */
    public static function activeLetters(): array
    {
        $letters = [];
        foreach (self::terms() as $term) {
            $letters[$term['letter']] = true;
        }

        return array_keys($letters);
    }

    /**
     * @return array<string, array<int, array{
     *     slug: string,
     *     term: string,
     *     letter: string,
     *     paragraphs: array<int, string>,
     *     related: array<int, array{label: string, href: string}>
     * }>>
     */
    public static function groupedByLetter(): array
    {
        $grouped = [];
        foreach (self::terms() as $term) {
            $grouped[$term['letter']][] = $term;
        }

        ksort($grouped);

        return $grouped;
    }
}
