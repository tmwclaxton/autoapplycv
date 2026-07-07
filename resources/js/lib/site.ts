export const GITHUB_REPOSITORY_URL =
    'https://github.com/tmwclaxton/autoapplycv';

export const DISCORD_INVITE_URL = 'https://discord.gg/DqqqTv3Spt';

export const CONTACT_EMAIL = 'hello@autocvapply.com';

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
    'Indeed',
    'Trakstar',
    'WordPress',
    'LinkedIn',
] as const;

export const AUTO_APPLY_COMING_SOON_PLATFORMS = SUPPORTED_PLATFORMS.filter(
    (
        platform,
    ): platform is Exclude<
        (typeof SUPPORTED_PLATFORMS)[number],
        'LinkedIn' | 'Indeed'
    > => platform !== 'LinkedIn' && platform !== 'Indeed',
);

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
