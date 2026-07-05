<?php

namespace App\Console\Commands;

use App\Http\Controllers\ReadmeScreenshotController;
use App\Models\CvProfile;
use App\Models\User;
use App\Support\ApplicationSettings;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class SeedReadmeDemoCommand extends Command
{
    protected $signature = 'readme:seed-demo';

    protected $description = 'Seed Jane Doe demo user and CV profile for README screenshots';

    public function handle(): int
    {
        $user = User::query()->updateOrCreate(
            ['email' => ReadmeScreenshotController::DEMO_EMAIL],
            [
                'name' => 'Jane Doe',
                'workos_id' => 'readme-demo-'.Str::uuid(),
                'email_verified_at' => now(),
                'avatar' => '',
                'subscription_tier' => 'free',
                'subscription_status' => 'active',
                'fields_autofilled' => 47,
                'ai_tokens_period_start' => now()->startOfMonth(),
            ],
        );

        CvProfile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'full_name' => 'Jane Doe',
                'headline' => 'Product Marketing Manager',
                'email' => ReadmeScreenshotController::DEMO_EMAIL,
                'phone' => '+44 7700 900123',
                'location' => 'Manchester, United Kingdom',
                'city' => 'Manchester',
                'postcode' => 'M1 1AA',
                'country' => 'United Kingdom',
                'linkedin_url' => 'https://linkedin.com/in/jane-doe-example',
                'website_url' => 'https://janedoe.example.com',
                'summary' => 'Product marketing manager with eight years in B2B SaaS. I turn complex features into clear stories that help buyers understand value quickly.',
                'skills' => [
                    'Product marketing',
                    'Go-to-market strategy',
                    'Messaging & positioning',
                    'Customer research',
                    'SaaS analytics',
                    'Cross-functional leadership',
                ],
                'experience' => [
                    [
                        'title' => 'Senior Product Marketing Manager',
                        'company' => 'Northwind Analytics',
                        'location' => 'Manchester, UK',
                        'start_date' => '2021-03',
                        'end_date' => 'Present',
                        'is_current' => true,
                        'description' => 'Lead positioning and launch campaigns for the core analytics platform.',
                        'highlights' => [
                            'Launched three tier-one product releases with integrated sales enablement.',
                            'Improved demo-to-trial conversion by refining onboarding messaging.',
                            'Partnered with product and sales on competitive battlecards.',
                        ],
                        'technologies' => ['HubSpot', 'Amplitude', 'Figma'],
                    ],
                    [
                        'title' => 'Product Marketing Manager',
                        'company' => 'Example Labs Ltd',
                        'location' => 'Leeds, UK',
                        'start_date' => '2018-01',
                        'end_date' => '2021-02',
                        'is_current' => false,
                        'description' => 'Owned messaging for mid-market HR software.',
                        'highlights' => [
                            'Built launch playbooks reused across four product lines.',
                            'Ran win/loss interviews that informed roadmap prioritisation.',
                        ],
                        'technologies' => ['Salesforce', 'Gong'],
                    ],
                ],
                'education' => [
                    [
                        'degree' => 'BA Marketing',
                        'institution' => 'University of Example',
                        'location' => 'Birmingham, UK',
                        'start_date' => '2013-09',
                        'end_date' => '2016-06',
                    ],
                ],
                'structured_data' => [
                    'languages' => [
                        ['language' => 'English', 'proficiency' => 'Native'],
                        ['language' => 'French', 'proficiency' => 'Professional'],
                    ],
                    'certifications' => [
                        ['name' => 'Pragmatic Institute PMC', 'issuer' => 'Pragmatic Institute', 'date' => '2020'],
                    ],
                    'projects' => [],
                ],
                'application_settings' => array_merge(ApplicationSettings::defaults(), [
                    'years_of_experience' => '8',
                    'expected_salary_yearly' => '55000',
                    'visa_sponsorship' => 'no',
                    'legally_authorized' => 'yes',
                    'willing_to_relocate' => 'yes',
                    'notice_period' => '1 month',
                    'job_preferences' => 'Remote-first B2B SaaS roles with clear product-market fit.',
                ]),
                'raw_cv_text' => 'Jane Doe - Product Marketing Manager (demo profile for README screenshots).',
                'formatted_cv_text' => "Jane Doe\nProduct Marketing Manager\nManchester, United Kingdom\n\nSummary\nProduct marketing manager with eight years in B2B SaaS.\n\nExperience\nSenior Product Marketing Manager - Northwind Analytics (2021-Present)\nProduct Marketing Manager - Example Labs Ltd (2018-2021)\n\nEducation\nBA Marketing - University of Example (2016)",
                'extra_context' => 'Open to hybrid roles in Manchester or fully remote UK roles.',
                'parsing_complete' => true,
            ],
        );

        $this->info('Demo user ready: '.ReadmeScreenshotController::DEMO_EMAIL);
        $this->line('Local login: '.url('/__readme/demo-login'));

        return self::SUCCESS;
    }
}
