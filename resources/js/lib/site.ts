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

/** Official logo/favicon URLs used when refreshing public/images/platforms/logos. */
export const PLATFORM_LOGO_SOURCES: Record<string, string> = {
    Workday: 'https://workday.com/favicon.ico',
    Greenhouse: 'https://icons.duckduckgo.com/ip3/greenhouse.io.ico',
    Lever: 'https://icons.duckduckgo.com/ip3/lever.co.ico',
    Ashby: 'https://icons.duckduckgo.com/ip3/ashbyhq.com.ico',
    SmartRecruiters: 'https://smartrecruiters.com/favicon.ico',
    Teamtailor: 'https://teamtailor.com/apple-touch-icon.png',
    Oracle: 'https://oracle.com/apple-touch-icon.png',
    BambooHR: 'https://bamboohr.com/favicon.ico',
    Workable: 'https://workable.com/apple-touch-icon.png',
    iCIMS: 'https://icims.com/favicon.ico',
    Trakstar: 'https://trakstar.com/apple-touch-icon.png',
    WordPress: 'https://wordpress.com/favicon.ico',
    LinkedIn: 'https://linkedin.com/favicon.ico',
    Indeed: 'https://indeed.com/apple-touch-icon.png',
    Totaljobs: 'https://totaljobs.com/favicon.ico',
    Glassdoor: 'https://icons.duckduckgo.com/ip3/glassdoor.com.ico',
    SimplyHired: 'https://icons.duckduckgo.com/ip3/simplyhired.com.ico',
    Reed: 'https://reed.co.uk/favicon.ico',
    'CV-Library': 'https://cv-library.co.uk/apple-touch-icon.png',
    Adzuna: 'https://icons.duckduckgo.com/ip3/adzuna.com.ico',
    'APS Jobs':
        'https://www.apsjobs.gov.au/resource/1576746072000/CommunityResources/resources/favicon/favicon-96x96.png',
    CareerBuilder: 'https://www.careerbuilder.com/favicon.ico',
    CareerOne: 'https://careerone.com.au/favicon.ico',
    'Civil Service Jobs':
        'https://icons.duckduckgo.com/ip3/civilservicejobs.service.gov.uk.ico',
    Dice: 'https://icons.duckduckgo.com/ip3/dice.com.ico',
    Eluta: 'https://eluta.ca/favicon.ico',
    EthicalJobs: 'https://ethicaljobs.com.au/apple-touch-icon.png',
    'Find a Job': 'https://icons.duckduckgo.com/ip3/findajob.dwp.gov.uk.ico',
    FlexJobs: 'https://flexjobs.com/apple-touch-icon.png',
    'Government Jobs': 'https://governmentjobs.com/favicon.ico',
    'Guardian Jobs':
        'https://icons.duckduckgo.com/ip3/jobs.theguardian.com.ico',
    Idealist: 'https://idealist.org/apple-touch-icon.png',
    'IrishJobs.ie': 'https://irishjobs.ie/favicon.ico',
    'Job Bank': 'https://icons.duckduckgo.com/ip3/jobbank.gc.ca.ico',
    'Jobs.ac.uk': 'https://icons.duckduckgo.com/ip3/jobs.ac.uk.ico',
    'Jobs Go Public': 'https://jobsgopublic.com/favicon.ico',
    JobSearch: 'https://www.jobsearch.gov.au/apple-touch-icon.png',
    'Jobs.ie': 'https://jobs.ie/favicon.ico',
    JobsIreland:
        'https://www.jobsireland.ie/modules/orchard.themes/Content/orchard.ico',
    Jobserve: 'https://jobserve.com/favicon.ico',
    JobsDB: 'https://www.jobsdb.com/static/shared-web/iphone-7c4d7dcb05fece466d8901945e36bbaa.png',
    JobStreet:
        'https://www.jobstreet.com/static/shared-web/iphone-7c4d7dcb05fece466d8901945e36bbaa.png',
    Jobillico: 'https://icons.duckduckgo.com/ip3/jobillico.com.ico',
    Jora: 'https://icons.duckduckgo.com/ip3/jora.com.ico',
    Ladders: 'https://icons.duckduckgo.com/ip3/theladders.com.ico',
    'LG Jobs': 'https://lgjobs.com/favicon.ico',
    LinkUp: 'https://linkup.com/apple-touch-icon.png',
    Monster: 'https://www.monster.com/favicon.ico',
    'NHS Jobs':
        'https://www.jobs.nhs.uk/candidate/public/nhsuk-frontend/assets/favicons/apple-touch-icon-180x180-15a5044def.png',
    'NZ Government Jobs': 'https://jobs.govt.nz/favicon.ico',
    'Publicjobs.ie': 'https://icons.duckduckgo.com/ip3/publicjobs.ie.ico',
    SEEK: 'https://www.seek.com.au/favicon.ico',
    Snagajob: 'https://icons.duckduckgo.com/ip3/www.snagajob.com.ico',
    'Trade Me Jobs': 'https://trademe.co.nz/apple-touch-icon.png',
    USAJobs: 'https://www.usajobs.gov/favicon.ico',
    Workopolis: 'https://icons.duckduckgo.com/ip3/workopolis.com.ico',
    ZipRecruiter: 'https://ziprecruiter.com/apple-touch-icon.png',
};

function platformLogoSlug(platform: string): string {
    return platform
        .toLowerCase()
        .replace(/\./g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function platformLogoExtension(sourceUrl: string): 'png' | 'ico' {
    const pathname = sourceUrl.split('?')[0]?.toLowerCase() ?? '';

    return pathname.endsWith('.ico') ? 'ico' : 'png';
}

export function platformLogoUrl(platform: string): string | null {
    const sourceUrl = PLATFORM_LOGO_SOURCES[platform];

    if (!sourceUrl) {
        return null;
    }

    const slug = platformLogoSlug(platform);
    const extension = platformLogoExtension(sourceUrl);

    return `/images/platforms/logos/${slug}.${extension}`;
}

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
