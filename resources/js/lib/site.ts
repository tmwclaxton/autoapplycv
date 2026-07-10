export const GITHUB_REPOSITORY_URL =
    'https://github.com/tmwclaxton/autoapplycv';

export const DISCORD_INVITE_URL = 'https://discord.gg/DqqqTv3Spt';

export const CONTACT_EMAIL = 'hello@autocvapply.com';

export const FORM_CORPUS_SCENARIO_COUNT = 6229;
export const FORM_CORPUS_VETTED_COUNT = 3942;

/** ATS and employer career sites where extension autofill is verified. */
export const SUPPORTED_PLATFORMS = [
    'Workday',
    'Greenhouse',
    'Lever',
    'Ashby',
    'SmartRecruiters',
    'Teamtailor',
    'Oracle',
    'BambooHR',
    'Workable',
    'iCIMS',
    'Trakstar',
    'WordPress',
] as const;

/** Job boards with end-to-end Auto Apply in the extension sidebar. */
export const AUTO_APPLY_SUPPORTED_PLATFORMS = [
    'LinkedIn',
    'Indeed',
    'Totaljobs',
    'Glassdoor',
    'SimplyHired',
    'Reed',
    'CV-Library',
] as const;

/** Job boards planned for Auto Apply across the Anglosphere - not ATS or employer career sites. */
export const AUTO_APPLY_COMING_SOON_PLATFORMS = [
    'Adzuna',
    'APS Jobs',
    'CareerBuilder',
    'CareerOne',
    'Civil Service Jobs',
    'Dice',
    'Eluta',
    'EthicalJobs',
    'Find a Job',
    'FlexJobs',
    'Government Jobs',
    'Guardian Jobs',
    'Idealist',
    'IrishJobs.ie',
    'Job Bank',
    'Jobs.ac.uk',
    'Jobs Go Public',
    'JobSearch',
    'Jobs.ie',
    'JobsIreland',
    'Jobserve',
    'JobsDB',
    'JobStreet',
    'Jobillico',
    'Jora',
    'Ladders',
    'LG Jobs',
    'LinkUp',
    'Monster',
    'NHS Jobs',
    'NZ Government Jobs',
    'Publicjobs.ie',
    'SEEK',
    'Snagajob',
    'Trade Me Jobs',
    'USAJobs',
    'Workopolis',
    'ZipRecruiter',
] as const;

export const AUTO_APPLY_MARKETING_LINE =
    'LinkedIn Easy Apply, Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, SimplyHired Quick Apply, Reed Easy Apply, and CV-Library Easy Apply';

export const PLATFORM_MARKETING_LINE =
    'Most major ATS and employer career sites - including Workday, Greenhouse, Lever, Ashby, SmartRecruiters, and many more.';

/** Lowercase, no trailing period - for mid-sentence use in marketing copy. */
export const PLATFORM_MARKETING_INLINE =
    'most major ATS and employer career sites - including Workday, Greenhouse, Lever, Ashby, SmartRecruiters, and many more';

export const SETUP_STEPS = [
    {
        number: '01',
        title: 'Post your CV',
        description:
            'Drop in a PDF or Word file. We read it once and pull out the useful bits.',
    },
    {
        number: '02',
        title: 'Check the details',
        description:
            'Tweak anything we missed - skills, summary, visa status, salary floor, the lot.',
    },
    {
        number: '03',
        title: 'Stamp the forms',
        description:
            'Install the extension. Hit autofill on major ATS and career sites.',
    },
] as const;

export const MARKETING_NAV_LINKS = [
    { label: 'Blog', route: 'blog' },
    { label: 'How to', route: 'how-to' },
    { label: 'Pricing', route: 'pricing' },
    { label: 'Analytics', route: 'analytics' },
    { label: 'About', route: 'about' },
    { label: 'Contact', route: 'contact' },
] as const;

export const FOOTER_LINKS = [
    { label: 'Blog', route: 'blog' },
    { label: 'How to', route: 'how-to' },
    { label: 'Pricing', route: 'pricing' },
    { label: 'Analytics', route: 'analytics' },
    { label: 'About', route: 'about' },
    { label: 'Contact', route: 'contact' },
    { label: 'Terms', route: 'terms' },
    { label: 'Privacy', route: 'privacy' },
] as const;
