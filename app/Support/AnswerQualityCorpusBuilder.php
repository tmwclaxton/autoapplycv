<?php

namespace App\Support;

class AnswerQualityCorpusBuilder
{
    /**
     * @return array<string, mixed>
     */
    public static function build(): array
    {
        $personas = self::personas();
        $scenarios = self::buildScenarios($personas);

        return [
            'version' => 1,
            'generated_at' => now()->toIso8601String(),
            'scenario_count' => count($scenarios),
            'profile_personas' => $personas,
            'scenarios' => $scenarios,
        ];
    }

    public static function writeJsonFile(?string $path = null): void
    {
        $path ??= base_path(AnswerQualityCorpus::CORPUS_PATH);
        $corpus = self::build();
        $directory = dirname($path);

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        file_put_contents(
            $path,
            json_encode($corpus, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n",
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function personas(): array
    {
        $path = base_path('scripts/extension-benchmark/answer-quality-personas.json');

        if (! is_file($path)) {
            throw new \RuntimeException('Missing answer-quality-personas.json');
        }

        $personas = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        if (! is_array($personas) || $personas === []) {
            throw new \RuntimeException('answer-quality-personas.json is empty');
        }

        return $personas;
    }

    /**
     * @param  array<string, array<string, mixed>>  $personas
     * @return array<int, array<string, mixed>>
     */
    private static function buildScenarios(array $personas): array
    {
        $items = [];

        $items = array_merge($items, self::handCraftedScenarios($personas));
        $items = array_merge($items, self::expansionScenarios($personas));

        $seen = [];

        return array_values(array_filter($items, static function (array $entry) use (&$seen): bool {
            if (isset($seen[$entry['id']])) {
                return false;
            }

            $seen[$entry['id']] = true;

            return true;
        }));
    }

    /**
     * @param  array<string, array<string, mixed>>  $personas
     * @return array<int, array<string, mixed>>
     */
    private static function handCraftedScenarios(array $personas): array
    {
        return [
            self::scenario('laravel-portfolio-github', 'senior_laravel_dev', [
                'title' => 'Senior Laravel Engineer',
                'company' => 'StackForge',
                'description_snippet' => 'Build APIs with Laravel, Vue, PostgreSQL. GitHub or portfolio required.',
            ], [[
                'label' => 'Share your GitHub profile or portfolio work relevant to this role',
                'ref' => 'q6',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, [
                'job_keywords' => ['Laravel', 'Vue', 'PostgreSQL', 'API'],
                'must_mention' => ['Riverbank Systems'],
                'must_not_mention' => ['fintech', 'enterprise software projects', 'eager to deepen expertise'],
            ]),
            self::scenario('laravel-motivation', 'senior_laravel_dev', [
                'title' => 'Senior Laravel Engineer',
                'company' => 'StackForge',
                'description_snippet' => 'Remote-first team modernising billing infrastructure.',
            ], [[
                'label' => 'Why are you interested in this role?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
                'max_chars' => 800,
            ]], $personas, ['job_keywords' => ['Laravel', 'billing', 'remote']]),
            self::scenario('laravel-domain-laravel', 'senior_laravel_dev', [
                'title' => 'Backend Engineer',
                'company' => 'ApiCraft',
                'description_snippet' => 'Deep Laravel experience maintaining high-traffic APIs.',
            ], [[
                'label' => 'Describe your experience with Laravel in production',
                'ref' => 'laravel-exp',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, ['job_keywords' => ['Laravel', 'API', 'production']]),
            self::scenario('laravel-salary', 'senior_laravel_dev', [
                'title' => 'Senior Laravel Engineer',
                'company' => 'StackForge',
                'description_snippet' => 'Competitive UK salary.',
            ], [[
                'label' => 'What are your salary expectations?',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, [
                'must_mention' => ['65000'],
                'must_not_mention' => ['fintech'],
                'job_keywords' => ['salary'],
            ]),
            self::scenario('laravel-culture-short', 'senior_laravel_dev', [
                'title' => 'Senior Laravel Engineer',
                'company' => 'StackForge',
                'description_snippet' => 'Collaborative engineering culture with code review focus.',
            ], [[
                'label' => 'In one sentence, what excites you about StackForge?',
                'ref' => 'short-fit',
                'field_type' => 'text',
                'max_chars' => 200,
            ]], $personas),
            self::scenario('marketing-motivation', 'marketing_manager', [
                'title' => 'Demand Generation Manager',
                'company' => 'RevLoop',
                'description_snippet' => 'Own pipeline for B2B SaaS with ABM and SEO.',
            ], [[
                'label' => 'What motivates you to apply for this role?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
                'max_chars' => 600,
            ]], $personas, [
                'job_keywords' => ['ABM', 'SEO', 'pipeline', 'SaaS'],
                'must_mention' => ['BrightWave Analytics'],
            ]),
            self::scenario('marketing-domain-abm', 'marketing_manager', [
                'title' => 'Marketing Manager',
                'company' => 'FinOps Cloud',
                'description_snippet' => 'Account-based marketing to enterprise finance buyers.',
            ], [[
                'label' => 'Describe your experience running ABM campaigns',
                'ref' => 'abm',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, ['job_keywords' => ['ABM', 'enterprise', 'finance']]),
            self::scenario('marketing-salary', 'marketing_manager', [
                'title' => 'Marketing Manager',
                'company' => 'RevLoop',
                'description_snippet' => 'SF Bay Area compensation.',
            ], [[
                'label' => 'Desired annual base salary',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['95000']]),
            self::scenario('marketing-culture', 'marketing_manager', [
                'title' => 'Content Marketing Lead',
                'company' => 'Northstar CRM',
                'description_snippet' => 'Fast-paced startup marketing team.',
            ], [[
                'label' => 'How would you describe your working style in a startup environment?',
                'ref' => 'culture',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas),
            self::scenario('marketing-short-interest', 'marketing_manager', [
                'title' => 'Growth Marketer',
                'company' => 'MetricPulse',
                'description_snippet' => 'SEO and content for analytics product.',
            ], [[
                'label' => 'Briefly summarise your most relevant marketing achievement',
                'ref' => 'short',
                'field_type' => 'text',
                'max_chars' => 250,
            ]], $personas, ['must_mention' => ['BrightWave Analytics']]),
            self::scenario('secops-domain', 'cybersecurity_analyst', [
                'title' => 'SecOps Engineer',
                'company' => 'ShieldPoint',
                'description_snippet' => 'SIEM tuning, incident response, Splunk experience required.',
            ], [[
                'label' => 'Describe your security operations and SIEM experience',
                'ref' => 'q9',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, [
                'job_keywords' => ['SIEM', 'Splunk', 'incident response', 'SecOps'],
                'must_mention' => ['SecureNet Defence'],
                'must_not_mention' => ['fintech', 'CrowdStrike expert', '10 years SOC'],
            ]),
            self::scenario('secops-motivation', 'cybersecurity_analyst', [
                'title' => 'Security Analyst',
                'company' => 'ShieldPoint',
                'description_snippet' => '24/7 SOC supporting financial services clients.',
            ], [[
                'label' => 'Why do you want to join our security team?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, ['job_keywords' => ['SOC', 'security']]),
            self::scenario('secops-short', 'cybersecurity_analyst', [
                'title' => 'SOC Analyst',
                'company' => 'WatchTower',
                'description_snippet' => 'Alert triage and playbook execution.',
            ], [[
                'label' => 'Summarise your SOC experience in 2-3 sentences',
                'ref' => 'short',
                'field_type' => 'text',
                'max_chars' => 300,
            ]], $personas, ['must_mention' => ['SecureNet Defence']]),
            self::scenario('secops-salary', 'cybersecurity_analyst', [
                'title' => 'Security Analyst',
                'company' => 'ShieldPoint',
                'description_snippet' => 'Manchester-based SOC role.',
            ], [[
                'label' => 'Expected annual salary (GBP)',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['52000']]),
            self::scenario('secops-honest-gap', 'cybersecurity_analyst', [
                'title' => 'Cloud Security Architect',
                'company' => 'AzureGuard',
                'description_snippet' => 'Requires 5+ years designing Azure landing zones.',
            ], [[
                'label' => 'Describe your experience designing Azure cloud security architecture',
                'ref' => 'azure-gap',
                'field_type' => 'textarea',
                'max_chars' => 400,
            ]], $personas, [
                'must_not_mention' => ['designed Azure landing zones', 'Azure architect for 5 years'],
                'job_keywords' => ['Azure', 'cloud security'],
            ]),
            self::scenario('swedish-motivation', 'swedish_product_designer', [
                'title' => 'Senior UX Designer',
                'company' => 'Vekst',
                'description_snippet' => 'Design system och tillgänglighet för B2B-produkt.',
            ], [[
                'label' => 'Varför vill du jobba hos oss?',
                'ref' => 'sv-motivation',
                'field_type' => 'textarea',
                'max_chars' => 600,
            ]], $personas, [
                'job_keywords' => ['design system', 'tillgänglighet', 'UX'],
                'must_mention' => ['Nordic Flow AB'],
            ]),
            self::scenario('swedish-short', 'swedish_product_designer', [
                'title' => 'UX Designer',
                'company' => 'Nordic Apps',
                'description_snippet' => 'Figma och användarforskning.',
            ], [[
                'label' => 'Beskriv kort din viktigaste designprestation',
                'ref' => 'sv-short',
                'field_type' => 'text',
                'max_chars' => 250,
            ]], $personas, ['must_mention' => ['Nordic Flow AB']]),
            self::scenario('swedish-portfolio', 'swedish_product_designer', [
                'title' => 'Product Designer',
                'company' => 'FlowStudio',
                'description_snippet' => 'Portfolio eller case studies önskas.',
            ], [[
                'label' => 'Dela gärna portfolio eller case study-länkar',
                'ref' => 'sv-portfolio',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, ['must_mention' => ['Nordic Flow AB']]),
            self::scenario('swedish-salary', 'swedish_product_designer', [
                'title' => 'Senior UX Designer',
                'company' => 'Vekst',
                'description_snippet' => 'Stockholm, heltid.',
            ], [[
                'label' => 'Löneförväntan (SEK per år)',
                'ref' => 'sv-salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['720000']]),
            self::scenario('swedish-english-bilingual', 'swedish_product_designer', [
                'title' => 'UX Designer',
                'company' => 'Global Nordic',
                'description_snippet' => 'English-speaking team, Swedish market focus.',
            ], [[
                'label' => 'How do you adapt UX research for Swedish-speaking users?',
                'ref' => 'bilingual',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, ['must_mention' => ['Nordic Flow AB']]),
            self::scenario('career-change-motivation', 'career_changer_teacher', [
                'title' => 'Junior Full Stack Developer',
                'company' => 'LearnBridge',
                'description_snippet' => 'Supportive team for early-career developers.',
            ], [[
                'label' => 'Why are you switching careers into software development?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, [
                'must_mention' => ['West Yorkshire Academy', 'Bridge Labs'],
                'job_keywords' => ['career change', 'junior', 'React'],
            ]),
            self::scenario('career-change-honest', 'career_changer_teacher', [
                'title' => 'Senior Staff Engineer',
                'company' => 'MegaCorp',
                'description_snippet' => 'Requires 10+ years distributed systems leadership.',
            ], [[
                'label' => 'Describe your experience leading large distributed systems teams',
                'ref' => 'gap',
                'field_type' => 'textarea',
            ]], $personas, [
                'must_not_mention' => ['led distributed systems', '10 years engineering leadership'],
            ]),
            self::scenario('career-change-short', 'career_changer_teacher', [
                'title' => 'Junior Developer',
                'company' => 'CodeSprout',
                'description_snippet' => 'React and Node.js product team.',
            ], [[
                'label' => 'What have you built since completing your bootcamp?',
                'ref' => 'short',
                'field_type' => 'text',
                'max_chars' => 300,
            ]], $personas, ['must_mention' => ['Bridge Labs']]),
            self::scenario('career-change-salary', 'career_changer_teacher', [
                'title' => 'Junior Developer',
                'company' => 'LearnBridge',
                'description_snippet' => 'Leeds-based hybrid role.',
            ], [[
                'label' => 'Expected salary',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['32000']]),
            self::scenario('frontend-portfolio', 'junior_frontend_dev', [
                'title' => 'Frontend Developer',
                'company' => 'WebCraft',
                'description_snippet' => 'React, TypeScript, accessibility-focused agency work.',
            ], [[
                'label' => 'Link to GitHub or portfolio showcasing React work',
                'ref' => 'portfolio',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, [
                'must_mention' => ['Pixel Orchard Agency'],
                'job_keywords' => ['React', 'accessibility'],
            ]),
            self::scenario('frontend-motivation', 'junior_frontend_dev', [
                'title' => 'React Developer',
                'company' => 'UI Labs',
                'description_snippet' => 'Component library and design system team.',
            ], [[
                'label' => 'Why do you want this frontend role?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, ['must_mention' => ['Pixel Orchard Agency']]),
            self::scenario('frontend-a11y', 'junior_frontend_dev', [
                'title' => 'Accessible UI Engineer',
                'company' => 'Inclusive Web Co',
                'description_snippet' => 'WCAG compliance and Lighthouse scores matter.',
            ], [[
                'label' => 'Describe your experience improving web accessibility',
                'ref' => 'a11y',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, ['job_keywords' => ['accessibility', 'Lighthouse', 'WCAG']]),
            self::scenario('frontend-salary', 'junior_frontend_dev', [
                'title' => 'Frontend Developer',
                'company' => 'WebCraft',
                'description_snippet' => 'Midlands salary band.',
            ], [[
                'label' => 'Annual salary expectation (GBP)',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['38000']]),
            self::scenario('devops-k8s', 'devops_engineer', [
                'title' => 'Platform Engineer',
                'company' => 'ShipFast',
                'description_snippet' => 'Kubernetes on AWS, Terraform, GitHub Actions.',
            ], [[
                'label' => 'Describe your Kubernetes and CI/CD experience',
                'ref' => 'k8s',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, [
                'job_keywords' => ['Kubernetes', 'AWS', 'Terraform', 'CI/CD'],
                'must_mention' => ['CloudSpan Iberia'],
            ]),
            self::scenario('devops-motivation', 'devops_engineer', [
                'title' => 'DevOps Engineer',
                'company' => 'ShipFast',
                'description_snippet' => 'Platform team supporting 40 microservices.',
            ], [[
                'label' => 'Why are you interested in joining our platform team?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, ['must_mention' => ['CloudSpan Iberia']]),
            self::scenario('devops-short', 'devops_engineer', [
                'title' => 'SRE',
                'company' => 'ReliableCloud',
                'description_snippet' => 'On-call rotation and observability.',
            ], [[
                'label' => 'Summarise a production incident you helped resolve',
                'ref' => 'short',
                'field_type' => 'text',
                'max_chars' => 350,
            ]], $personas, ['must_mention' => ['CloudSpan Iberia']]),
            self::scenario('devops-salary', 'devops_engineer', [
                'title' => 'DevOps Engineer',
                'company' => 'ShipFast',
                'description_snippet' => 'Barcelona hybrid.',
            ], [[
                'label' => 'Expected gross annual salary (EUR)',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['55000']]),
            self::scenario('data-sql', 'data_analyst', [
                'title' => 'Analytics Engineer',
                'company' => 'RetailIQ',
                'description_snippet' => 'SQL, dbt, Snowflake, executive dashboards.',
            ], [[
                'label' => 'Describe your SQL and dashboard experience',
                'ref' => 'sql',
                'field_type' => 'textarea',
            ]], $personas, [
                'job_keywords' => ['SQL', 'Tableau', 'dbt', 'Snowflake'],
                'must_mention' => ['Emerald Retail Group'],
            ]),
            self::scenario('data-motivation', 'data_analyst', [
                'title' => 'Data Analyst',
                'company' => 'RetailIQ',
                'description_snippet' => 'Retail analytics team in Dublin.',
            ], [[
                'label' => 'Why do you want to work in retail analytics?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, ['must_mention' => ['Emerald Retail Group']]),
            self::scenario('data-short', 'data_analyst', [
                'title' => 'BI Analyst',
                'company' => 'InsightCo',
                'description_snippet' => 'Weekly reporting automation.',
            ], [[
                'label' => 'What is your strongest analytics skill and where did you use it?',
                'ref' => 'short',
                'field_type' => 'text',
                'max_chars' => 250,
            ]], $personas, ['must_mention' => ['Emerald Retail Group']]),
            self::scenario('data-salary', 'data_analyst', [
                'title' => 'Data Analyst',
                'company' => 'RetailIQ',
                'description_snippet' => 'Dublin office.',
            ], [[
                'label' => 'Salary expectations (EUR annual)',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['48000']]),
            self::scenario('nurse-motivation', 'nurse_healthcare', [
                'title' => 'Ward Manager',
                'company' => 'CareNorth',
                'description_snippet' => 'Leadership on acute medical wards.',
            ], [[
                'label' => 'Why do you want this ward management role?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, [
                'must_mention' => ['Royal North Hospital'],
                'must_not_mention' => ['software', 'Laravel', 'fintech'],
            ]),
            self::scenario('nurse-domain', 'nurse_healthcare', [
                'title' => 'Clinical Nurse',
                'company' => 'CareNorth',
                'description_snippet' => 'Patient safety and infection control focus.',
            ], [[
                'label' => 'Describe your clinical leadership and audit experience',
                'ref' => 'clinical',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, ['job_keywords' => ['patient safety', 'infection control', 'ward']]),
            self::scenario('nurse-salary', 'nurse_healthcare', [
                'title' => 'Staff Nurse',
                'company' => 'CareNorth',
                'description_snippet' => 'NHS banded role Newcastle.',
            ], [[
                'label' => 'Expected annual salary',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['35000']]),
            self::scenario('sales-motivation', 'sales_executive', [
                'title' => 'Enterprise AE',
                'company' => 'CloseWin',
                'description_snippet' => 'Mid-market SaaS quota carrier.',
            ], [[
                'label' => 'Why are you a strong fit for enterprise SaaS sales?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, [
                'job_keywords' => ['SaaS', 'quota', 'mid-market'],
                'must_mention' => ['PipelineHQ'],
            ]),
            self::scenario('sales-domain', 'sales_executive', [
                'title' => 'Account Executive',
                'company' => 'CloseWin',
                'description_snippet' => 'Consultative discovery and Salesforce pipeline hygiene.',
            ], [[
                'label' => 'Describe a complex deal you closed and how you ran discovery',
                'ref' => 'deal',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, ['must_mention' => ['PipelineHQ']]),
            self::scenario('sales-short', 'sales_executive', [
                'title' => 'AE',
                'company' => 'QuotaBase',
                'description_snippet' => 'B2B software sales.',
            ], [[
                'label' => 'What was your quota attainment last year?',
                'ref' => 'short',
                'field_type' => 'text',
                'max_chars' => 200,
            ]], $personas, ['must_mention' => ['PipelineHQ']]),
            self::scenario('sales-salary', 'sales_executive', [
                'title' => 'Enterprise AE',
                'company' => 'CloseWin',
                'description_snippet' => 'OTE disclosed after screen.',
            ], [[
                'label' => 'Base salary expectation (USD)',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['85000']]),
            self::scenario('ux-portfolio-private', 'freelance_ux', [
                'title' => 'Product Designer',
                'company' => 'StealthPay',
                'description_snippet' => 'Fintech product design, portfolio review required.',
            ], [[
                'label' => 'Share portfolio or GitHub work relevant to product design',
                'ref' => 'q6',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, [
                'must_mention' => ['Harbour FinTech'],
                'must_not_mention' => ['public GitHub repo', 'open source fintech app', 'enterprise software projects'],
            ]),
            self::scenario('ux-motivation', 'freelance_ux', [
                'title' => 'Senior UX Designer',
                'company' => 'HealthBridge',
                'description_snippet' => 'Healthcare UX with research-led design.',
            ], [[
                'label' => 'Why do you want to move from freelance to in-house design?',
                'ref' => 'motivation',
                'field_type' => 'textarea',
            ]], $personas, ['must_mention' => ['Self-employed', 'Harbour FinTech']]),
            self::scenario('ux-nda-honest', 'freelance_ux', [
                'title' => 'UX Lead',
                'company' => 'PrivateBank',
                'description_snippet' => 'Show publicly available case studies.',
            ], [[
                'label' => 'Link to public case studies of your fintech UX work',
                'ref' => 'public-cases',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, [
                'must_not_mention' => ['github.com/amira', 'public portfolio link for NDA work'],
            ]),
            self::scenario('ux-salary', 'freelance_ux', [
                'title' => 'Product Designer',
                'company' => 'HealthBridge',
                'description_snippet' => 'London hybrid.',
            ], [[
                'label' => 'Expected salary (GBP)',
                'ref' => 'salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['60000']]),
            self::scenario('german-motivation', 'german_engineer', [
                'title' => 'Backend-Entwickler',
                'company' => 'LogistikTech',
                'description_snippet' => 'Java, Spring Boot, Kafka in Industrie 4.0.',
            ], [[
                'label' => 'Warum möchten Sie bei uns arbeiten?',
                'ref' => 'de-motivation',
                'field_type' => 'textarea',
                'max_chars' => 600,
            ]], $personas, [
                'job_keywords' => ['Java', 'Spring Boot', 'Kafka'],
                'must_mention' => ['IndustrieWerk GmbH'],
            ]),
            self::scenario('german-domain', 'german_engineer', [
                'title' => 'Software Engineer',
                'company' => 'LogistikTech',
                'description_snippet' => 'Event-getriebene Architektur mit Kafka.',
            ], [[
                'label' => 'Beschreiben Sie Ihre Erfahrung mit Kafka und Event-Pipelines',
                'ref' => 'de-kafka',
                'field_type' => 'text',
                'max_chars' => 400,
            ]], $personas, ['must_mention' => ['IndustrieWerk GmbH']]),
            self::scenario('german-short', 'german_engineer', [
                'title' => 'Java Entwickler',
                'company' => 'FactorySoft',
                'description_snippet' => 'REST-APIs für interne Tools.',
            ], [[
                'label' => 'Nennen Sie ein konkretes Projekt aus Ihrer aktuellen Rolle',
                'ref' => 'de-short',
                'field_type' => 'text',
                'max_chars' => 250,
            ]], $personas, ['must_mention' => ['IndustrieWerk GmbH']]),
            self::scenario('german-salary', 'german_engineer', [
                'title' => 'Backend-Entwickler',
                'company' => 'LogistikTech',
                'description_snippet' => 'Berlin Vollzeit.',
            ], [[
                'label' => 'Gehaltsvorstellung (EUR brutto pro Jahr)',
                'ref' => 'de-salary',
                'field_type' => 'text',
            ]], $personas, ['must_mention' => ['72000']]),
            self::scenario('german-english-switch', 'german_engineer', [
                'title' => 'Backend Engineer',
                'company' => 'GlobalLogistics',
                'description_snippet' => 'English-speaking engineering team in Berlin.',
            ], [[
                'label' => 'Describe your Java backend experience for an international team',
                'ref' => 'en-java',
                'field_type' => 'textarea',
                'max_chars' => 500,
            ]], $personas, ['must_mention' => ['IndustrieWerk GmbH']]),
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $personas
     * @return array<int, array<string, mixed>>
     */
    private static function expansionScenarios(array $personas): array
    {
        $items = [];

        $templates = [
            [
                'suffix' => 'culture-fit-v2',
                'question' => [
                    'label' => 'What about our company culture appeals to you?',
                    'ref' => 'culture-v2',
                    'field_type' => 'textarea',
                    'max_chars' => 450,
                ],
            ],
            [
                'suffix' => 'team-collab',
                'question' => [
                    'label' => 'How do you collaborate with cross-functional teams?',
                    'ref' => 'collab',
                    'field_type' => 'text',
                    'max_chars' => 350,
                ],
            ],
            [
                'suffix' => 'start-date',
                'question' => [
                    'label' => 'When could you start?',
                    'ref' => 'start',
                    'field_type' => 'text',
                ],
            ],
        ];

        $personaJobTitles = [
            'senior_laravel_dev' => ['Staff Engineer', 'PHP Architect'],
            'marketing_manager' => ['Head of Growth', 'Product Marketing Lead'],
            'cybersecurity_analyst' => ['Threat Hunter', 'Incident Responder'],
            'swedish_product_designer' => ['Lead Designer', 'UX Researcher'],
            'career_changer_teacher' => ['Full Stack Developer', 'Software Engineer I'],
            'junior_frontend_dev' => ['UI Engineer', 'Web Developer'],
            'devops_engineer' => ['Cloud Engineer', 'Infrastructure Engineer'],
            'data_analyst' => ['BI Developer', 'Analytics Lead'],
            'nurse_healthcare' => ['Senior Staff Nurse', 'Clinical Lead'],
            'sales_executive' => ['Regional Sales Director', 'Strategic AE'],
            'freelance_ux' => ['Design Lead', 'UX Research Lead'],
            'german_engineer' => ['Senior Java Developer', 'Integration Engineer'],
        ];

        foreach ($personaJobTitles as $personaKey => $titles) {
            foreach ($titles as $index => $title) {
                foreach ($templates as $template) {
                    $items[] = self::scenario(
                        "{$personaKey}-{$template['suffix']}-".($index + 1),
                        $personaKey,
                        [
                            'title' => $title,
                            'company' => explode(' ', $title)[0].'Co',
                            'description_snippet' => 'Looking for a '.strtolower($title).' with relevant experience.',
                        ],
                        [$template['question']],
                        $personas,
                    );
                }
            }
        }

        return $items;
    }

    /**
     * @param  array<string, mixed>  $jobContext
     * @param  array<int, array<string, mixed>>  $questions
     * @param  array<string, array<string, mixed>>  $personas
     * @param  array<string, mixed>  $extras
     * @return array<string, mixed>
     */
    private static function scenario(
        string $id,
        string $profileFixture,
        array $jobContext,
        array $questions,
        array $personas,
        array $extras = [],
    ): array {
        $employers = collect($personas[$profileFixture]['experience'] ?? [])
            ->pluck('company')
            ->filter()
            ->values()
            ->all();

        return [
            'id' => $id,
            'profile_fixture' => $profileFixture,
            'job_context' => $jobContext,
            'questions' => $questions,
            'job_keywords' => $extras['job_keywords'] ?? [],
            'must_mention' => $extras['must_mention'] ?? array_slice($employers, 0, 1),
            'must_not_mention' => $extras['must_not_mention'] ?? ['fintech', 'invented metrics', 'proven track record'],
        ];
    }
}
