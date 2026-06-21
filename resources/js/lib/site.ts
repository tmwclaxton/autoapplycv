export const GITHUB_REPOSITORY_URL = 'https://github.com/tmwclaxton/autoapplycv';

export const CONTACT_EMAIL = 'hello@autocvapply.com';

export const SUPPORTED_PLATFORMS = [
    'Workday',
    'Indeed',
    'LinkedIn',
    'Greenhouse',
    'Lever',
] as const;

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
            'Tweak anything we missed — skills, summary, visa status, salary floor, the lot.',
    },
    {
        number: '03',
        title: 'Stamp the forms',
        description:
            'Install the extension. Hit autofill on Workday, Indeed, and the rest.',
    },
] as const;

export const MARKETING_NAV_LINKS = [
    { label: 'How to', route: 'how-to' },
    { label: 'About', route: 'about' },
    { label: 'Contact', route: 'contact' },
] as const;

export const FOOTER_LINKS = [
    { label: 'How to', route: 'how-to' },
    { label: 'About', route: 'about' },
    { label: 'Contact', route: 'contact' },
    { label: 'Terms', route: 'terms' },
    { label: 'Privacy', route: 'privacy' },
] as const;
