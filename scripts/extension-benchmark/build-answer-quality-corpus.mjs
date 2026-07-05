#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PERSONAS = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/extension-benchmark/answer-quality-personas.json'), 'utf8'),
);

function employerNames(persona) {
    return (persona.experience ?? [])
        .map((row) => row.company)
        .filter(Boolean);
}

function scenario(id, profileFixture, jobContext, questions, extras = {}) {
    const persona = PERSONAS[profileFixture];

    return {
        id,
        profile_fixture: profileFixture,
        job_context: jobContext,
        questions,
        job_keywords: extras.job_keywords ?? [],
        must_mention: extras.must_mention ?? employerNames(persona).slice(0, 1),
        must_not_mention: extras.must_not_mention ?? ['fintech', 'invented metrics', 'proven track record'],
    };
}

function buildScenarios() {
    const items = [];

    items.push(
        scenario(
            'laravel-portfolio-github',
            'senior_laravel_dev',
            {
                title: 'Senior Laravel Engineer',
                company: 'StackForge',
                description_snippet: 'Build APIs with Laravel, Vue, PostgreSQL. GitHub or portfolio required.',
            },
            [{
                label: 'Share your GitHub profile or portfolio work relevant to this role',
                ref: 'q6',
                field_type: 'textarea',
                max_chars: 500,
            }],
            {
                job_keywords: ['Laravel', 'Vue', 'PostgreSQL', 'API'],
                must_mention: ['Riverbank Systems'],
                must_not_mention: ['fintech', 'enterprise software projects', 'eager to deepen expertise'],
            },
        ),
        scenario(
            'laravel-motivation',
            'senior_laravel_dev',
            {
                title: 'Senior Laravel Engineer',
                company: 'StackForge',
                description_snippet: 'Remote-first team modernising billing infrastructure.',
            },
            [{
                label: 'Why are you interested in this role?',
                ref: 'motivation',
                field_type: 'textarea',
                max_chars: 800,
            }],
            { job_keywords: ['Laravel', 'billing', 'remote'] },
        ),
        scenario(
            'laravel-domain-laravel',
            'senior_laravel_dev',
            {
                title: 'Backend Engineer',
                company: 'ApiCraft',
                description_snippet: 'Deep Laravel experience maintaining high-traffic APIs.',
            },
            [{
                label: 'Describe your experience with Laravel in production',
                ref: 'laravel-exp',
                field_type: 'text',
                max_chars: 400,
            }],
            { job_keywords: ['Laravel', 'API', 'production'] },
        ),
        scenario(
            'laravel-salary',
            'senior_laravel_dev',
            {
                title: 'Senior Laravel Engineer',
                company: 'StackForge',
                description_snippet: 'Competitive UK salary.',
            },
            [{
                label: 'What are your salary expectations?',
                ref: 'salary',
                field_type: 'text',
            }],
            {
                must_mention: ['65000'],
                must_not_mention: ['fintech'],
                job_keywords: ['salary'],
            },
        ),
        scenario(
            'laravel-culture-short',
            'senior_laravel_dev',
            {
                title: 'Senior Laravel Engineer',
                company: 'StackForge',
                description_snippet: 'Collaborative engineering culture with code review focus.',
            },
            [{
                label: 'In one sentence, what excites you about StackForge?',
                ref: 'short-fit',
                field_type: 'text',
                max_chars: 200,
            }],
        ),
    );

    items.push(
        scenario(
            'marketing-motivation',
            'marketing_manager',
            {
                title: 'Demand Generation Manager',
                company: 'RevLoop',
                description_snippet: 'Own pipeline for B2B SaaS with ABM and SEO.',
            },
            [{
                label: 'What motivates you to apply for this role?',
                ref: 'motivation',
                field_type: 'textarea',
                max_chars: 600,
            }],
            { job_keywords: ['ABM', 'SEO', 'pipeline', 'SaaS'], must_mention: ['BrightWave Analytics'] },
        ),
        scenario(
            'marketing-domain-abm',
            'marketing_manager',
            {
                title: 'Marketing Manager',
                company: 'FinOps Cloud',
                description_snippet: 'Account-based marketing to enterprise finance buyers.',
            },
            [{
                label: 'Describe your experience running ABM campaigns',
                ref: 'abm',
                field_type: 'text',
                max_chars: 400,
            }],
            { job_keywords: ['ABM', 'enterprise', 'finance'] },
        ),
        scenario(
            'marketing-salary',
            'marketing_manager',
            {
                title: 'Marketing Manager',
                company: 'RevLoop',
                description_snippet: 'SF Bay Area compensation.',
            },
            [{
                label: 'Desired annual base salary',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['95000'] },
        ),
        scenario(
            'marketing-culture',
            'marketing_manager',
            {
                title: 'Content Marketing Lead',
                company: 'Northstar CRM',
                description_snippet: 'Fast-paced startup marketing team.',
            },
            [{
                label: 'How would you describe your working style in a startup environment?',
                ref: 'culture',
                field_type: 'textarea',
                max_chars: 500,
            }],
        ),
        scenario(
            'marketing-short-interest',
            'marketing_manager',
            {
                title: 'Growth Marketer',
                company: 'MetricPulse',
                description_snippet: 'SEO and content for analytics product.',
            },
            [{
                label: 'Briefly summarise your most relevant marketing achievement',
                ref: 'short',
                field_type: 'text',
                max_chars: 250,
            }],
            { must_mention: ['BrightWave Analytics'] },
        ),
    );

    items.push(
        scenario(
            'secops-domain',
            'cybersecurity_analyst',
            {
                title: 'SecOps Engineer',
                company: 'ShieldPoint',
                description_snippet: 'SIEM tuning, incident response, Splunk experience required.',
            },
            [{
                label: 'Describe your security operations and SIEM experience',
                ref: 'q9',
                field_type: 'textarea',
                max_chars: 500,
            }],
            {
                job_keywords: ['SIEM', 'Splunk', 'incident response', 'SecOps'],
                must_mention: ['SecureNet Defence'],
                must_not_mention: ['fintech', 'CrowdStrike expert', '10 years SOC'],
            },
        ),
        scenario(
            'secops-motivation',
            'cybersecurity_analyst',
            {
                title: 'Security Analyst',
                company: 'ShieldPoint',
                description_snippet: '24/7 SOC supporting financial services clients.',
            },
            [{
                label: 'Why do you want to join our security team?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            { job_keywords: ['SOC', 'security'] },
        ),
        scenario(
            'secops-short',
            'cybersecurity_analyst',
            {
                title: 'SOC Analyst',
                company: 'WatchTower',
                description_snippet: 'Alert triage and playbook execution.',
            },
            [{
                label: 'Summarise your SOC experience in 2-3 sentences',
                ref: 'short',
                field_type: 'text',
                max_chars: 300,
            }],
            { must_mention: ['SecureNet Defence'] },
        ),
        scenario(
            'secops-salary',
            'cybersecurity_analyst',
            {
                title: 'Security Analyst',
                company: 'ShieldPoint',
                description_snippet: 'Manchester-based SOC role.',
            },
            [{
                label: 'Expected annual salary (GBP)',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['52000'] },
        ),
        scenario(
            'secops-honest-gap',
            'cybersecurity_analyst',
            {
                title: 'Cloud Security Architect',
                company: 'AzureGuard',
                description_snippet: 'Requires 5+ years designing Azure landing zones.',
            },
            [{
                label: 'Describe your experience designing Azure cloud security architecture',
                ref: 'azure-gap',
                field_type: 'textarea',
                max_chars: 400,
            }],
            {
                must_not_mention: ['designed Azure landing zones', 'Azure architect for 5 years'],
                job_keywords: ['Azure', 'cloud security'],
            },
        ),
    );

    items.push(
        scenario(
            'swedish-motivation',
            'swedish_product_designer',
            {
                title: 'Senior UX Designer',
                company: 'Vekst',
                description_snippet: 'Design system och tillgänglighet för B2B-produkt.',
            },
            [{
                label: 'Varför vill du jobba hos oss?',
                ref: 'sv-motivation',
                field_type: 'textarea',
                max_chars: 600,
            }],
            {
                job_keywords: ['design system', 'tillgänglighet', 'UX'],
                must_mention: ['Nordic Flow AB'],
            },
        ),
        scenario(
            'swedish-short',
            'swedish_product_designer',
            {
                title: 'UX Designer',
                company: 'Nordic Apps',
                description_snippet: 'Figma och användarforskning.',
            },
            [{
                label: 'Beskriv kort din viktigaste designprestation',
                ref: 'sv-short',
                field_type: 'text',
                max_chars: 250,
            }],
            { must_mention: ['Nordic Flow AB'] },
        ),
        scenario(
            'swedish-portfolio',
            'swedish_product_designer',
            {
                title: 'Product Designer',
                company: 'FlowStudio',
                description_snippet: 'Portfolio eller case studies önskas.',
            },
            [{
                label: 'Dela gärna portfolio eller case study-länkar',
                ref: 'sv-portfolio',
                field_type: 'textarea',
                max_chars: 500,
            }],
            { must_mention: ['Nordic Flow AB'] },
        ),
        scenario(
            'swedish-salary',
            'swedish_product_designer',
            {
                title: 'Senior UX Designer',
                company: 'Vekst',
                description_snippet: 'Stockholm, heltid.',
            },
            [{
                label: 'Löneförväntan (SEK per år)',
                ref: 'sv-salary',
                field_type: 'text',
            }],
            { must_mention: ['720000'] },
        ),
        scenario(
            'swedish-english-bilingual',
            'swedish_product_designer',
            {
                title: 'UX Designer',
                company: 'Global Nordic',
                description_snippet: 'English-speaking team, Swedish market focus.',
            },
            [{
                label: 'How do you adapt UX research for Swedish-speaking users?',
                ref: 'bilingual',
                field_type: 'textarea',
                max_chars: 500,
            }],
            { must_mention: ['Nordic Flow AB'] },
        ),
    );

    items.push(
        scenario(
            'career-change-motivation',
            'career_changer_teacher',
            {
                title: 'Junior Full Stack Developer',
                company: 'LearnBridge',
                description_snippet: 'Supportive team for early-career developers.',
            },
            [{
                label: 'Why are you switching careers into software development?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            {
                must_mention: ['West Yorkshire Academy', 'Bridge Labs'],
                job_keywords: ['career change', 'junior', 'React'],
            },
        ),
        scenario(
            'career-change-honest',
            'career_changer_teacher',
            {
                title: 'Senior Staff Engineer',
                company: 'MegaCorp',
                description_snippet: 'Requires 10+ years distributed systems leadership.',
            },
            [{
                label: 'Describe your experience leading large distributed systems teams',
                ref: 'gap',
                field_type: 'textarea',
            }],
            {
                must_not_mention: ['led distributed systems', '10 years engineering leadership'],
            },
        ),
        scenario(
            'career-change-short',
            'career_changer_teacher',
            {
                title: 'Junior Developer',
                company: 'CodeSprout',
                description_snippet: 'React and Node.js product team.',
            },
            [{
                label: 'What have you built since completing your bootcamp?',
                ref: 'short',
                field_type: 'text',
                max_chars: 300,
            }],
            { must_mention: ['Bridge Labs'] },
        ),
        scenario(
            'career-change-salary',
            'career_changer_teacher',
            {
                title: 'Junior Developer',
                company: 'LearnBridge',
                description_snippet: 'Leeds-based hybrid role.',
            },
            [{
                label: 'Expected salary',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['32000'] },
        ),
    );

    items.push(
        scenario(
            'frontend-portfolio',
            'junior_frontend_dev',
            {
                title: 'Frontend Developer',
                company: 'WebCraft',
                description_snippet: 'React, TypeScript, accessibility-focused agency work.',
            },
            [{
                label: 'Link to GitHub or portfolio showcasing React work',
                ref: 'portfolio',
                field_type: 'text',
                max_chars: 400,
            }],
            { must_mention: ['Pixel Orchard Agency'], job_keywords: ['React', 'accessibility'] },
        ),
        scenario(
            'frontend-motivation',
            'junior_frontend_dev',
            {
                title: 'React Developer',
                company: 'UI Labs',
                description_snippet: 'Component library and design system team.',
            },
            [{
                label: 'Why do you want this frontend role?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            { must_mention: ['Pixel Orchard Agency'] },
        ),
        scenario(
            'frontend-a11y',
            'junior_frontend_dev',
            {
                title: 'Accessible UI Engineer',
                company: 'Inclusive Web Co',
                description_snippet: 'WCAG compliance and Lighthouse scores matter.',
            },
            [{
                label: 'Describe your experience improving web accessibility',
                ref: 'a11y',
                field_type: 'text',
                max_chars: 400,
            }],
            { job_keywords: ['accessibility', 'Lighthouse', 'WCAG'] },
        ),
        scenario(
            'frontend-salary',
            'junior_frontend_dev',
            {
                title: 'Frontend Developer',
                company: 'WebCraft',
                description_snippet: 'Midlands salary band.',
            },
            [{
                label: 'Annual salary expectation (GBP)',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['38000'] },
        ),
    );

    items.push(
        scenario(
            'devops-k8s',
            'devops_engineer',
            {
                title: 'Platform Engineer',
                company: 'ShipFast',
                description_snippet: 'Kubernetes on AWS, Terraform, GitHub Actions.',
            },
            [{
                label: 'Describe your Kubernetes and CI/CD experience',
                ref: 'k8s',
                field_type: 'textarea',
                max_chars: 500,
            }],
            {
                job_keywords: ['Kubernetes', 'AWS', 'Terraform', 'CI/CD'],
                must_mention: ['CloudSpan Iberia'],
            },
        ),
        scenario(
            'devops-motivation',
            'devops_engineer',
            {
                title: 'DevOps Engineer',
                company: 'ShipFast',
                description_snippet: 'Platform team supporting 40 microservices.',
            },
            [{
                label: 'Why are you interested in joining our platform team?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            { must_mention: ['CloudSpan Iberia'] },
        ),
        scenario(
            'devops-short',
            'devops_engineer',
            {
                title: 'SRE',
                company: 'ReliableCloud',
                description_snippet: 'On-call rotation and observability.',
            },
            [{
                label: 'Summarise a production incident you helped resolve',
                ref: 'short',
                field_type: 'text',
                max_chars: 350,
            }],
            { must_mention: ['CloudSpan Iberia'] },
        ),
        scenario(
            'devops-salary',
            'devops_engineer',
            {
                title: 'DevOps Engineer',
                company: 'ShipFast',
                description_snippet: 'Barcelona hybrid.',
            },
            [{
                label: 'Expected gross annual salary (EUR)',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['55000'] },
        ),
    );

    items.push(
        scenario(
            'data-sql',
            'data_analyst',
            {
                title: 'Analytics Engineer',
                company: 'RetailIQ',
                description_snippet: 'SQL, dbt, Snowflake, executive dashboards.',
            },
            [{
                label: 'Describe your SQL and dashboard experience',
                ref: 'sql',
                field_type: 'textarea',
            }],
            {
                job_keywords: ['SQL', 'Tableau', 'dbt', 'Snowflake'],
                must_mention: ['Emerald Retail Group'],
            },
        ),
        scenario(
            'data-motivation',
            'data_analyst',
            {
                title: 'Data Analyst',
                company: 'RetailIQ',
                description_snippet: 'Retail analytics team in Dublin.',
            },
            [{
                label: 'Why do you want to work in retail analytics?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            { must_mention: ['Emerald Retail Group'] },
        ),
        scenario(
            'data-short',
            'data_analyst',
            {
                title: 'BI Analyst',
                company: 'InsightCo',
                description_snippet: 'Weekly reporting automation.',
            },
            [{
                label: 'What is your strongest analytics skill and where did you use it?',
                ref: 'short',
                field_type: 'text',
                max_chars: 250,
            }],
            { must_mention: ['Emerald Retail Group'] },
        ),
        scenario(
            'data-salary',
            'data_analyst',
            {
                title: 'Data Analyst',
                company: 'RetailIQ',
                description_snippet: 'Dublin office.',
            },
            [{
                label: 'Salary expectations (EUR annual)',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['48000'] },
        ),
    );

    items.push(
        scenario(
            'nurse-motivation',
            'nurse_healthcare',
            {
                title: 'Ward Manager',
                company: 'CareNorth',
                description_snippet: 'Leadership on acute medical wards.',
            },
            [{
                label: 'Why do you want this ward management role?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            {
                must_mention: ['Royal North Hospital'],
                must_not_mention: ['software', 'Laravel', 'fintech'],
            },
        ),
        scenario(
            'nurse-domain',
            'nurse_healthcare',
            {
                title: 'Clinical Nurse',
                company: 'CareNorth',
                description_snippet: 'Patient safety and infection control focus.',
            },
            [{
                label: 'Describe your clinical leadership and audit experience',
                ref: 'clinical',
                field_type: 'text',
                max_chars: 400,
            }],
            { job_keywords: ['patient safety', 'infection control', 'ward'] },
        ),
        scenario(
            'nurse-salary',
            'nurse_healthcare',
            {
                title: 'Staff Nurse',
                company: 'CareNorth',
                description_snippet: 'NHS banded role Newcastle.',
            },
            [{
                label: 'Expected annual salary',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['35000'] },
        ),
    );

    items.push(
        scenario(
            'sales-motivation',
            'sales_executive',
            {
                title: 'Enterprise AE',
                company: 'CloseWin',
                description_snippet: 'Mid-market SaaS quota carrier.',
            },
            [{
                label: 'Why are you a strong fit for enterprise SaaS sales?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            {
                job_keywords: ['SaaS', 'quota', 'mid-market'],
                must_mention: ['PipelineHQ'],
            },
        ),
        scenario(
            'sales-domain',
            'sales_executive',
            {
                title: 'Account Executive',
                company: 'CloseWin',
                description_snippet: 'Consultative discovery and Salesforce pipeline hygiene.',
            },
            [{
                label: 'Describe a complex deal you closed and how you ran discovery',
                ref: 'deal',
                field_type: 'textarea',
                max_chars: 500,
            }],
            { must_mention: ['PipelineHQ'] },
        ),
        scenario(
            'sales-short',
            'sales_executive',
            {
                title: 'AE',
                company: 'QuotaBase',
                description_snippet: 'B2B software sales.',
            },
            [{
                label: 'What was your quota attainment last year?',
                ref: 'short',
                field_type: 'text',
                max_chars: 200,
            }],
            { must_mention: ['PipelineHQ'] },
        ),
        scenario(
            'sales-salary',
            'sales_executive',
            {
                title: 'Enterprise AE',
                company: 'CloseWin',
                description_snippet: 'OTE disclosed after screen.',
            },
            [{
                label: 'Base salary expectation (USD)',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['85000'] },
        ),
    );

    items.push(
        scenario(
            'ux-portfolio-private',
            'freelance_ux',
            {
                title: 'Product Designer',
                company: 'StealthPay',
                description_snippet: 'Fintech product design, portfolio review required.',
            },
            [{
                label: 'Share portfolio or GitHub work relevant to product design',
                ref: 'q6',
                field_type: 'textarea',
                max_chars: 500,
            }],
            {
                must_mention: ['Harbour FinTech'],
                must_not_mention: ['public GitHub repo', 'open source fintech app', 'enterprise software projects'],
            },
        ),
        scenario(
            'ux-motivation',
            'freelance_ux',
            {
                title: 'Senior UX Designer',
                company: 'HealthBridge',
                description_snippet: 'Healthcare UX with research-led design.',
            },
            [{
                label: 'Why do you want to move from freelance to in-house design?',
                ref: 'motivation',
                field_type: 'textarea',
            }],
            { must_mention: ['Self-employed', 'Harbour FinTech'] },
        ),
        scenario(
            'ux-nda-honest',
            'freelance_ux',
            {
                title: 'UX Lead',
                company: 'PrivateBank',
                description_snippet: 'Show publicly available case studies.',
            },
            [{
                label: 'Link to public case studies of your fintech UX work',
                ref: 'public-cases',
                field_type: 'text',
                max_chars: 400,
            }],
            {
                must_not_mention: ['github.com/amira', 'public portfolio link for NDA work'],
            },
        ),
        scenario(
            'ux-salary',
            'freelance_ux',
            {
                title: 'Product Designer',
                company: 'HealthBridge',
                description_snippet: 'London hybrid.',
            },
            [{
                label: 'Expected salary (GBP)',
                ref: 'salary',
                field_type: 'text',
            }],
            { must_mention: ['60000'] },
        ),
    );

    items.push(
        scenario(
            'german-motivation',
            'german_engineer',
            {
                title: 'Backend-Entwickler',
                company: 'LogistikTech',
                description_snippet: 'Java, Spring Boot, Kafka in Industrie 4.0.',
            },
            [{
                label: 'Warum möchten Sie bei uns arbeiten?',
                ref: 'de-motivation',
                field_type: 'textarea',
                max_chars: 600,
            }],
            {
                job_keywords: ['Java', 'Spring Boot', 'Kafka'],
                must_mention: ['IndustrieWerk GmbH'],
            },
        ),
        scenario(
            'german-domain',
            'german_engineer',
            {
                title: 'Software Engineer',
                company: 'LogistikTech',
                description_snippet: 'Event-getriebene Architektur mit Kafka.',
            },
            [{
                label: 'Beschreiben Sie Ihre Erfahrung mit Kafka und Event-Pipelines',
                ref: 'de-kafka',
                field_type: 'text',
                max_chars: 400,
            }],
            { must_mention: ['IndustrieWerk GmbH'] },
        ),
        scenario(
            'german-short',
            'german_engineer',
            {
                title: 'Java Entwickler',
                company: 'FactorySoft',
                description_snippet: 'REST-APIs für interne Tools.',
            },
            [{
                label: 'Nennen Sie ein konkretes Projekt aus Ihrer aktuellen Rolle',
                ref: 'de-short',
                field_type: 'text',
                max_chars: 250,
            }],
            { must_mention: ['IndustrieWerk GmbH'] },
        ),
        scenario(
            'german-salary',
            'german_engineer',
            {
                title: 'Backend-Entwickler',
                company: 'LogistikTech',
                description_snippet: 'Berlin Vollzeit.',
            },
            [{
                label: 'Gehaltsvorstellung (EUR brutto pro Jahr)',
                ref: 'de-salary',
                field_type: 'text',
            }],
            { must_mention: ['72000'] },
        ),
        scenario(
            'german-english-switch',
            'german_engineer',
            {
                title: 'Backend Engineer',
                company: 'GlobalLogistics',
                description_snippet: 'English-speaking engineering team in Berlin.',
            },
            [{
                label: 'Describe your Java backend experience for an international team',
                ref: 'en-java',
                field_type: 'textarea',
                max_chars: 500,
            }],
            { must_mention: ['IndustrieWerk GmbH'] },
        ),
    );

    const expansionTemplates = [
        {
            suffix: 'culture-fit-v2',
            question: {
                label: 'What about our company culture appeals to you?',
                ref: 'culture-v2',
                field_type: 'textarea',
                max_chars: 450,
            },
        },
        {
            suffix: 'team-collab',
            question: {
                label: 'How do you collaborate with cross-functional teams?',
                ref: 'collab',
                field_type: 'text',
                max_chars: 350,
            },
        },
        {
            suffix: 'start-date',
            question: {
                label: 'When could you start?',
                ref: 'start',
                field_type: 'text',
            },
        },
    ];

    const personaJobTitles = {
        senior_laravel_dev: ['Staff Engineer', 'PHP Architect'],
        marketing_manager: ['Head of Growth', 'Product Marketing Lead'],
        cybersecurity_analyst: ['Threat Hunter', 'Incident Responder'],
        swedish_product_designer: ['Lead Designer', 'UX Researcher'],
        career_changer_teacher: ['Full Stack Developer', 'Software Engineer I'],
        junior_frontend_dev: ['UI Engineer', 'Web Developer'],
        devops_engineer: ['Cloud Engineer', 'Infrastructure Engineer'],
        data_analyst: ['BI Developer', 'Analytics Lead'],
        nurse_healthcare: ['Senior Staff Nurse', 'Clinical Lead'],
        sales_executive: ['Regional Sales Director', 'Strategic AE'],
        freelance_ux: ['Design Lead', 'UX Research Lead'],
        german_engineer: ['Senior Java Developer', 'Integration Engineer'],
    };

    for (const [personaKey, titles] of Object.entries(personaJobTitles)) {
        for (const [index, title] of titles.entries()) {
            for (const template of expansionTemplates) {
                items.push(
                    scenario(
                        `${personaKey}-${template.suffix}-${index + 1}`,
                        personaKey,
                        {
                            title,
                            company: `${title.split(' ')[0]}Co`,
                            description_snippet: `Looking for a ${title.toLowerCase()} with relevant experience.`,
                        },
                        [template.question],
                    ),
                );
            }
        }
    }

    const seen = new Set();

    return items.filter((entry) => {
        if (seen.has(entry.id)) {
            return false;
        }

        seen.add(entry.id);

        return true;
    });
}

export function buildAnswerQualityCorpus() {
    const scenarios = buildScenarios();

    return {
        version: 1,
        generated_at: new Date().toISOString(),
        scenario_count: scenarios.length,
        profile_personas: PERSONAS,
        scenarios,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const corpus = buildAnswerQualityCorpus();
    const outPath = join(process.cwd(), 'scripts/extension-benchmark/answer-quality-corpus.json');
    writeFileSync(outPath, `${JSON.stringify(corpus, null, 2)}\n`);
    console.log(`Wrote ${corpus.scenario_count} scenarios to ${outPath}`);
}
