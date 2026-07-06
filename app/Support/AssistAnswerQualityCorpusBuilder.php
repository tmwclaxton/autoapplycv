<?php

namespace App\Support;

class AssistAnswerQualityCorpusBuilder
{
    /**
     * @return array<string, mixed>
     */
    public static function build(): array
    {
        $personas = AnswerQualityCorpusBuilder::personas();
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
        $path ??= base_path(AssistAnswerQualityCorpus::CORPUS_PATH);
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
     * @param  array<string, array<string, mixed>>  $personas
     * @return array<int, array<string, mixed>>
     */
    private static function buildScenarios(array $personas): array
    {
        $items = array_merge(
            self::handCraftedScenarios($personas),
            self::expansionScenarios($personas),
        );

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
        $stackForge = [
            'title' => 'Senior Laravel Engineer',
            'company' => 'StackForge',
            'description_snippet' => 'Remote-first team modernising billing infrastructure with Laravel and Vue.',
        ];

        $revLoop = [
            'title' => 'Demand Generation Manager',
            'company' => 'RevLoop',
            'description_snippet' => 'B2B SaaS marketing team focused on pipeline growth in the US.',
        ];

        return [
            self::scenario('laravel-motivation-uk-formal', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Draft an answer for "Why are you interested in this role?" for StackForge. Keep it formal and paste-ready.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'job_context' => $stackForge,
                'must_mention' => ['Riverbank Systems'],
                'must_not_mention' => ['based on your profile', 'fintech'],
                'max_words' => 120,
            ]),
            self::scenario('laravel-why-company-brief', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'In one sentence, why StackForge? Application form, UK English.'],
            ], 'brief', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'job_context' => $stackForge,
                'max_words' => 35,
            ]),
            self::scenario('laravel-salary-numeric', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'What should I put for salary expectations on this UK form?'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'job_context' => $stackForge,
                'must_mention' => ['65000'],
                'max_words' => 40,
            ]),
            self::scenario('laravel-notice-period', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Draft my notice period answer for an employer form.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'must_mention' => ['1 month'],
                'max_words' => 30,
            ]),
            self::scenario('laravel-laravel-experience', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Describe my Laravel production experience for this application - paste-ready, first person.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'job_context' => $stackForge,
                'must_mention' => ['Riverbank Systems', 'Laravel'],
                'max_words' => 100,
            ]),
            self::scenario('laravel-relocate-no', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Are you willing to relocate? Yes or no with a short reason.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'screening_format' => 'yes_no',
                'must_mention' => ['no'],
                'max_words' => 40,
            ]),
            self::scenario('laravel-right-to-work', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Do you have the right to work in the UK? Form answer please.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'screening_format' => 'yes_no',
                'max_words' => 35,
            ]),
            self::scenario('marketing-motivation-us', 'marketing_manager', [
                ['role' => 'user', 'content' => 'Help me answer why I want to join RevLoop - casual but professional, US tone.'],
            ], 'form_answer', [
                'formality' => 'casual',
                'locale' => 'en-US',
                'voice' => 'mid',
            ], [
                'job_context' => $revLoop,
                'must_mention' => ['BrightWave Analytics'],
                'max_words' => 110,
            ]),
            self::scenario('marketing-salary-us', 'marketing_manager', [
                ['role' => 'user', 'content' => 'Salary expectations for this SF role - paste into the form.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-US',
                'voice' => 'mid',
            ], [
                'job_context' => $revLoop,
                'must_mention' => ['95000'],
                'max_words' => 35,
            ]),
            self::scenario('marketing-pipeline-impact', 'marketing_manager', [
                ['role' => 'user', 'content' => 'Describe a campaign that drove measurable pipeline results. First person, employer form.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-US',
                'voice' => 'mid',
            ], [
                'must_mention' => ['BrightWave Analytics'],
                'max_words' => 100,
            ]),
            self::scenario('career-changer-motivation', 'career_changer_teacher', [
                ['role' => 'user', 'content' => 'Draft why I moved from teaching into software development - honest, UK form answer.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'junior',
            ], [
                'must_mention' => ['Bridge Labs', 'teacher'],
                'max_words' => 120,
            ]),
            self::scenario('career-changer-gap-honesty', 'career_changer_teacher', [
                ['role' => 'user', 'content' => 'How do I explain my career change on a form without sounding generic? Give me paste-ready text.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'junior',
            ], [
                'must_mention' => ['West Yorkshire Academy'],
                'must_not_mention' => ['passionate about'],
                'max_words' => 100,
            ]),
            self::scenario('junior-react-experience', 'junior_frontend_dev', [
                ['role' => 'user', 'content' => 'Write my React experience for an agency application - junior tone, UK.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'junior',
            ], [
                'must_mention' => ['Pixel Orchard Agency', 'React'],
                'max_words' => 90,
            ]),
            self::scenario('junior-portfolio-github', 'junior_frontend_dev', [
                ['role' => 'user', 'content' => 'Share GitHub or portfolio work relevant to frontend roles - paste-ready.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'junior',
            ], [
                'must_mention' => ['Pixel Orchard'],
                'max_words' => 80,
            ]),
            self::scenario('cyber-incident-response', 'cybersecurity_analyst', [
                ['role' => 'user', 'content' => 'Describe my incident response experience for a SOC role application.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'mid',
            ], [
                'must_mention' => ['SecureNet Defence', 'Splunk'],
                'max_words' => 100,
            ]),
            self::scenario('cyber-salary-uk', 'cybersecurity_analyst', [
                ['role' => 'user', 'content' => 'Expected salary on this Manchester security role?'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'mid',
            ], [
                'must_mention' => ['52000'],
                'max_words' => 30,
            ]),
            self::scenario('swedish-motivation-sv', 'swedish_product_designer', [
                ['role' => 'user', 'content' => 'Skriv ett kort svar på varför jag vill jobba hos Nordic Flow AB - klistra in i formuläret.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'sv-SE',
                'voice' => 'senior',
            ], [
                'job_context' => [
                    'title' => 'Senior UX Designer',
                    'company' => 'Nordic Flow AB',
                    'description_snippet' => 'Design system och tillgänglighet för B2B-produkter.',
                ],
                'must_mention' => ['Nordic Flow'],
                'max_words' => 100,
            ]),
            self::scenario('devops-kubernetes', 'devops_engineer', [
                ['role' => 'user', 'content' => 'Describe my Kubernetes and AWS experience for this platform role - first person.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'must_mention' => ['CloudSpan Iberia', 'Kubernetes'],
                'max_words' => 100,
            ]),
            self::scenario('data-analyst-sql', 'data_analyst', [
                ['role' => 'user', 'content' => 'Draft an answer about my SQL and dashboard work for a retail analytics role.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-IE',
                'voice' => 'mid',
            ], [
                'must_mention' => ['Emerald Retail Group', 'Tableau'],
                'max_words' => 100,
            ]),
            self::scenario('nurse-clinical-care', 'nurse_healthcare', [
                ['role' => 'user', 'content' => 'Write a paste-ready answer about my ward leadership and patient safety experience.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'must_mention' => ['Royal North Hospital'],
                'max_words' => 100,
            ]),
            self::scenario('diversity-optional-advice', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'The form has an optional diversity monitoring section. What should I put if I prefer not to disclose?'],
            ], 'advice', [
                'formality' => 'casual',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'max_words' => 80,
            ]),
            self::scenario('visa-sponsorship', 'devops_engineer', [
                ['role' => 'user', 'content' => 'Do you require visa sponsorship? Form answer for a UK employer.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'screening_format' => 'yes_no',
                'max_words' => 40,
            ]),
            self::scenario('competency-deadlines-star', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Give me a STAR-style answer about meeting a tight deadline - paste into competency question.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'must_mention' => ['Riverbank Systems'],
                'max_words' => 130,
            ]),
            self::scenario('custom-employer-question', 'marketing_manager', [
                ['role' => 'user', 'content' => 'RevLoop asks: "Tell us about a time you turned content into revenue." Draft my answer.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-US',
                'voice' => 'mid',
            ], [
                'job_context' => $revLoop,
                'must_mention' => ['BrightWave Analytics'],
                'max_words' => 120,
            ]),
            self::scenario('advice-location-field', 'junior_frontend_dev', [
                ['role' => 'user', 'content' => 'What should I put in the location field on UK employer forms?'],
            ], 'advice', [
                'formality' => 'casual',
                'locale' => 'en-GB',
                'voice' => 'junior',
            ], [
                'max_words' => 80,
            ]),
            self::scenario('advice-notice-period-meaning', 'career_changer_teacher', [
                ['role' => 'user', 'content' => 'What does notice period mean on application forms?'],
            ], 'advice', [
                'formality' => 'casual',
                'locale' => 'en-GB',
                'voice' => 'junior',
            ], [
                'max_words' => 70,
            ]),
            self::scenario('advice-formal-tone', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'How formal should application answers be for a bank compliance form?'],
            ], 'advice', [
                'formality' => 'casual',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'max_words' => 90,
            ]),
            self::scenario('focused-field-context', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Help me answer this screening question.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'context' => [
                    'focused_field' => [
                        'label' => 'Years of Laravel experience in production',
                        'field_type' => 'text',
                        'max_chars' => 200,
                    ],
                    'job' => $stackForge,
                ],
                'must_mention' => ['Riverbank Systems'],
                'max_chars' => 200,
            ]),
            self::scenario('multi-turn-refine-motivation', 'senior_laravel_dev', [
                ['role' => 'user', 'content' => 'Draft a motivation answer for StackForge.'],
                ['role' => 'assistant', 'content' => 'I want to join StackForge because your billing modernisation work aligns with the Laravel APIs I have shipped at Riverbank Systems.'],
                ['role' => 'user', 'content' => 'Shorter please - under 40 words, still first person.'],
            ], 'form_answer', [
                'formality' => 'formal',
                'locale' => 'en-GB',
                'voice' => 'senior',
            ], [
                'job_context' => $stackForge,
                'must_mention' => ['Riverbank Systems'],
                'max_words' => 40,
            ]),
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $personas
     * @return array<int, array<string, mixed>>
     */
    private static function expansionScenarios(array $personas): array
    {
        $items = [];
        $personaKeys = array_keys($personas);

        $questionTemplates = [
            ['id' => 'motivation', 'message' => 'Draft a motivation answer for this role - paste-ready.', 'style' => 'form_answer', 'max_words' => 100],
            ['id' => 'salary', 'message' => 'What salary should I enter on the form?', 'style' => 'form_answer', 'max_words' => 35],
            ['id' => 'notice', 'message' => 'Draft my notice period for the employer form.', 'style' => 'form_answer', 'max_words' => 30],
            ['id' => 'why-company', 'message' => 'Why this company? One paragraph, first person.', 'style' => 'form_answer', 'max_words' => 90],
            ['id' => 'teamwork', 'message' => 'Help me answer a teamwork question without sounding generic.', 'style' => 'form_answer', 'max_words' => 110],
            ['id' => 'advice-tone', 'message' => 'How formal should I be on this application?', 'style' => 'advice', 'max_words' => 70],
        ];

        $jobsByPersona = [
            'senior_laravel_dev' => ['title' => 'Senior Laravel Engineer', 'company' => 'StackForge'],
            'marketing_manager' => ['title' => 'Marketing Manager', 'company' => 'RevLoop'],
            'cybersecurity_analyst' => ['title' => 'SOC Analyst', 'company' => 'SecureNet Defence'],
            'career_changer_teacher' => ['title' => 'Junior Developer', 'company' => 'Bridge Labs'],
            'junior_frontend_dev' => ['title' => 'Frontend Developer', 'company' => 'Pixel Orchard Agency'],
            'devops_engineer' => ['title' => 'DevOps Engineer', 'company' => 'CloudSpan Iberia'],
            'data_analyst' => ['title' => 'Data Analyst', 'company' => 'Emerald Retail Group'],
            'nurse_healthcare' => ['title' => 'Staff Nurse', 'company' => 'Royal North Hospital'],
            'swedish_product_designer' => ['title' => 'UX Designer', 'company' => 'Nordic Flow AB'],
        ];

        $toneByPersona = [
            'senior_laravel_dev' => ['formality' => 'formal', 'locale' => 'en-GB', 'voice' => 'senior'],
            'marketing_manager' => ['formality' => 'casual', 'locale' => 'en-US', 'voice' => 'mid'],
            'cybersecurity_analyst' => ['formality' => 'formal', 'locale' => 'en-GB', 'voice' => 'mid'],
            'career_changer_teacher' => ['formality' => 'formal', 'locale' => 'en-GB', 'voice' => 'junior'],
            'junior_frontend_dev' => ['formality' => 'formal', 'locale' => 'en-GB', 'voice' => 'junior'],
            'devops_engineer' => ['formality' => 'formal', 'locale' => 'en-GB', 'voice' => 'senior'],
            'data_analyst' => ['formality' => 'formal', 'locale' => 'en-IE', 'voice' => 'mid'],
            'nurse_healthcare' => ['formality' => 'formal', 'locale' => 'en-GB', 'voice' => 'senior'],
            'swedish_product_designer' => ['formality' => 'formal', 'locale' => 'sv-SE', 'voice' => 'senior'],
        ];

        foreach ($personaKeys as $personaKey) {
            if (! isset($jobsByPersona[$personaKey], $toneByPersona[$personaKey])) {
                continue;
            }

            foreach ($questionTemplates as $template) {
                $extras = [
                    'job_context' => $jobsByPersona[$personaKey],
                    'max_words' => $template['max_words'],
                ];

                if ($template['id'] === 'salary') {
                    $salary = $personas[$personaKey]['application_settings']['expected_salary_yearly'] ?? null;

                    if (is_string($salary) && $salary !== '') {
                        $extras['must_mention'] = [$salary];
                    }
                }

                if (in_array($template['style'], ['form_answer', 'brief'], true)) {
                    $employer = $personas[$personaKey]['experience'][0]['company'] ?? null;

                    if (is_string($employer) && $employer !== '' && $template['id'] !== 'salary') {
                        $extras['must_mention'] = [$employer];
                    }
                }

                $items[] = self::scenario(
                    id: "expand-{$personaKey}-{$template['id']}",
                    profileFixture: $personaKey,
                    conversation: [
                        ['role' => 'user', 'content' => $template['message']],
                    ],
                    responseStyle: $template['style'],
                    tone: $toneByPersona[$personaKey],
                    extras: $extras,
                );
            }
        }

        return $items;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @param  array<string, mixed>  $tone
     * @param  array<string, mixed>  $extras
     * @return array<string, mixed>
     */
    private static function scenario(
        string $id,
        string $profileFixture,
        array $conversation,
        string $responseStyle,
        array $tone,
        array $extras = [],
    ): array {
        $scenario = [
            'id' => $id,
            'profile_fixture' => $profileFixture,
            'category' => (string) ($extras['category'] ?? self::inferCategory($conversation, $responseStyle)),
            'conversation' => $conversation,
            'response_style' => $responseStyle,
            'tone' => $tone,
        ];

        foreach (['job_context', 'context', 'must_mention', 'must_not_mention', 'max_words', 'max_chars', 'screening_format'] as $key) {
            if (array_key_exists($key, $extras)) {
                $scenario[$key] = $extras[$key];
            }
        }

        return $scenario;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    private static function inferCategory(array $conversation, string $responseStyle): string
    {
        if ($responseStyle === 'advice') {
            return 'advice';
        }

        $lastUser = '';

        foreach (array_reverse($conversation) as $turn) {
            if (($turn['role'] ?? '') === 'user') {
                $lastUser = mb_strtolower((string) ($turn['content'] ?? ''));
                break;
            }
        }

        if (str_contains($lastUser, 'salary')) {
            return 'salary';
        }

        if (str_contains($lastUser, 'notice')) {
            return 'notice_period';
        }

        if (str_contains($lastUser, 'yes or no') || str_contains($lastUser, 'visa') || str_contains($lastUser, 'right to work')) {
            return 'screening';
        }

        if (str_contains($lastUser, 'diversity') || str_contains($lastUser, 'disclose')) {
            return 'diversity';
        }

        return 'open_text';
    }
}
