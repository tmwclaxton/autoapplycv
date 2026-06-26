export interface CvExperience {
    title: string;
    company: string;
    location: string | null;
    employment_type: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
    highlights: string[];
    technologies: string[];
}

export interface CvEducation {
    degree: string;
    field_of_study: string | null;
    institution: string;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    grade: string | null;
    honours: string | null;
    description: string | null;
    highlights: string[];
}

export interface CvSocialLink {
    label: string;
    url: string;
}

export interface CvLanguage {
    language: string;
    proficiency: string | null;
}

export interface CvCertification {
    name: string;
    issuer: string | null;
    date: string | null;
    credential_id: string | null;
    url: string | null;
}

export interface CvProject {
    name: string;
    url: string | null;
    description: string | null;
    highlights: string[];
    technologies: string[];
}

export interface CvPublication {
    title: string;
    publisher: string | null;
    date: string | null;
    url: string | null;
}

export interface CvAward {
    title: string;
    issuer: string | null;
    date: string | null;
    description: string | null;
}

export interface CvVolunteering {
    role: string;
    organisation: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    highlights: string[];
}

export interface CvMembership {
    name: string;
    organisation: string | null;
    date: string | null;
}

export interface CvReference {
    name: string;
    title: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
}

export interface CvTechnicalSkill {
    name: string;
    level: string | null;
}

export interface CvAdditionalSectionItem {
    label: string | null;
    value: string | null;
    details: string | null;
}

export interface CvAdditionalSection {
    title: string;
    items: CvAdditionalSectionItem[];
}

export interface CvStructuredData {
    headline: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    state_region: string | null;
    social_links: CvSocialLink[];
    languages: CvLanguage[];
    certifications: CvCertification[];
    projects: CvProject[];
    publications: CvPublication[];
    awards: CvAward[];
    volunteering: CvVolunteering[];
    memberships: CvMembership[];
    references: CvReference[];
    interests: string[];
    technical_skills: CvTechnicalSkill[];
    soft_skills: string[];
    additional_sections: CvAdditionalSection[];
}

export interface ApplicationSettings {
    phone_country_code: string;
    years_of_experience: string;
    expected_salary: string;
    visa_sponsorship: 'yes' | 'no';
    legally_authorized: 'yes' | 'no';
    willing_to_relocate: 'yes' | 'no';
    drivers_license: 'yes' | 'no';
    job_preferences: string;
}

export interface CvProfile {
    id?: number;
    full_name: string | null;
    headline: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
    linkedin_url: string | null;
    website_url: string | null;
    summary: string | null;
    skills: string[];
    experience: CvExperience[];
    education: CvEducation[];
    structured_data: CvStructuredData;
    formatted_cv_text: string | null;
    raw_cv_text: string | null;
    extra_context: string | null;
    application_settings: ApplicationSettings;
    parsing_complete: boolean;
}

export type CvProfileSection =
    | 'basic'
    | 'address'
    | 'summary'
    | 'skills'
    | 'experience'
    | 'education'
    | 'languages'
    | 'certifications'
    | 'projects'
    | 'publications'
    | 'awards'
    | 'volunteering'
    | 'memberships'
    | 'references'
    | 'interests'
    | 'additional'
    | 'formatted'
    | 'extra'
    | 'raw'
    | 'documents';

export function emptyStructuredData(): CvStructuredData {
    return {
        headline: null,
        address_line_1: null,
        address_line_2: null,
        state_region: null,
        social_links: [],
        languages: [],
        certifications: [],
        projects: [],
        publications: [],
        awards: [],
        volunteering: [],
        memberships: [],
        references: [],
        interests: [],
        technical_skills: [],
        soft_skills: [],
        additional_sections: [],
    };
}

export function emptyExperience(): CvExperience {
    return {
        title: '',
        company: '',
        location: null,
        employment_type: null,
        start_date: null,
        end_date: null,
        is_current: false,
        description: null,
        highlights: [],
        technologies: [],
    };
}

export function emptyEducation(): CvEducation {
    return {
        degree: '',
        field_of_study: null,
        institution: '',
        location: null,
        start_date: null,
        end_date: null,
        grade: null,
        honours: null,
        description: null,
        highlights: [],
    };
}

export function defaultApplicationSettings(): ApplicationSettings {
    return {
        phone_country_code: '+44',
        years_of_experience: '2',
        expected_salary: '',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        willing_to_relocate: 'yes',
        drivers_license: 'yes',
        job_preferences: '',
    };
}

export function normalizeApplicationSettings(
    input: Partial<ApplicationSettings> | null | undefined,
): ApplicationSettings {
    return {
        ...defaultApplicationSettings(),
        ...(input ?? {}),
    };
}

export function createEmptyProfile(): CvProfile {
    return {
        full_name: null,
        headline: null,
        email: null,
        phone: null,
        location: null,
        city: null,
        postcode: null,
        country: null,
        linkedin_url: null,
        website_url: null,
        summary: null,
        skills: [],
        experience: [],
        education: [],
        structured_data: emptyStructuredData(),
        formatted_cv_text: null,
        raw_cv_text: null,
        extra_context: null,
        application_settings: defaultApplicationSettings(),
        parsing_complete: false,
    };
}

function normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter(
        (item): item is string =>
            typeof item === 'string' && item.trim() !== '',
    );
}

function normalizeExperience(item: Partial<CvExperience>): CvExperience {
    return {
        ...emptyExperience(),
        ...item,
        title: item.title ?? '',
        company: item.company ?? '',
        highlights: normalizeStringList(item.highlights),
        technologies: normalizeStringList(item.technologies),
        is_current: Boolean(item.is_current),
    };
}

function normalizeEducation(item: Partial<CvEducation>): CvEducation {
    return {
        ...emptyEducation(),
        ...item,
        degree: item.degree ?? '',
        institution: item.institution ?? '',
        highlights: normalizeStringList(item.highlights),
    };
}

export function normalizeCvProfile(
    input: Partial<CvProfile> | null | undefined,
): CvProfile {
    const base = createEmptyProfile();

    if (!input) {
        return base;
    }

    return {
        ...base,
        ...input,
        skills: normalizeStringList(input.skills),
        experience: (input.experience ?? []).map((item) =>
            normalizeExperience(item),
        ),
        education: (input.education ?? []).map((item) =>
            normalizeEducation(item),
        ),
        structured_data: {
            ...emptyStructuredData(),
            ...(input.structured_data ?? {}),
            social_links: input.structured_data?.social_links ?? [],
            languages: input.structured_data?.languages ?? [],
            certifications: input.structured_data?.certifications ?? [],
            projects: (input.structured_data?.projects ?? []).map((item) => ({
                name: item.name ?? '',
                url: item.url ?? null,
                description: item.description ?? null,
                highlights: normalizeStringList(item.highlights),
                technologies: normalizeStringList(item.technologies),
            })),
            publications: input.structured_data?.publications ?? [],
            awards: input.structured_data?.awards ?? [],
            volunteering: (input.structured_data?.volunteering ?? []).map(
                (item) => ({
                    role: item.role ?? '',
                    organisation: item.organisation ?? null,
                    location: item.location ?? null,
                    start_date: item.start_date ?? null,
                    end_date: item.end_date ?? null,
                    highlights: normalizeStringList(item.highlights),
                }),
            ),
            memberships: input.structured_data?.memberships ?? [],
            references: input.structured_data?.references ?? [],
            interests: normalizeStringList(input.structured_data?.interests),
            technical_skills: input.structured_data?.technical_skills ?? [],
            soft_skills: normalizeStringList(
                input.structured_data?.soft_skills,
            ),
            additional_sections:
                input.structured_data?.additional_sections ?? [],
        },
        application_settings: normalizeApplicationSettings(
            input.application_settings,
        ),
    };
}

export function linesToList(value: string): string[] {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
}

export function listToLines(value: string[]): string {
    return value.join('\n');
}
