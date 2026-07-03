<?php

namespace Tests\Support;

use App\Support\ProfileUpdateValueFormatter;
use Tests\Support\AssistChatFixtures as F;

final class AssistChatScenarioCatalog
{
    /**
     * @return list<array<string, mixed>>
     */
    public static function all(): array
    {
        return array_merge(
            self::directUpdateScenarios(),
            self::mustNotParseScenarios(),
            self::followUpNameScenarios(),
            self::assistantProposalScenarios(),
            self::uiAndMetaQuestionScenarios(),
            self::complexMultiTurnScenarios(),
            self::confirmationAndCorrectionScenarios(),
            self::extractedProposalScenarios(),
            self::locationBundleScenarios(),
            self::correctionAndNegativeScenarios(),
            self::helpAndDraftQuestionScenarios(),
            self::aiExtractionPhrasingScenarios(),
            self::clearFieldScenarios(),
            self::preferenceUpdateScenarios(),
            self::extendedMultiTurnScenarios(),
            self::relocationPhrasingScenarios(),
            self::megaChangeRequestScenarios(),
        );
    }

    public static function count(): int
    {
        return count(self::all());
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function directUpdateScenarios(): array
    {
        $scenarios = [];
        $fields = [
            ['field' => 'full_name', 'phrases' => ['my name', 'my full name', 'full name'], 'values' => [F::PERSON_LOWER, 'jordan lee', 'sam taylor', 'casey brooks']],
            ['field' => 'city', 'phrases' => ['my city', 'city'], 'values' => [F::CITY_SOUTH, F::CITY_EAST, 'northvale', 'millfield']],
            ['field' => 'location', 'phrases' => ['my location', 'location on my profile', 'location'], 'values' => [F::CITY_SOUTH, 'eastwick uk', 'millfield']],
            ['field' => 'headline', 'phrases' => ['my headline', 'headline'], 'values' => ['senior laravel developer', 'full stack engineer']],
            ['field' => 'email', 'phrases' => ['my email', 'email'], 'values' => [F::EMAIL, 'sam.taylor@example.org']],
            ['field' => 'phone', 'phrases' => ['my phone', 'phone'], 'values' => ['07700900123', '+44 7700 900123']],
            ['field' => 'postcode', 'phrases' => ['my postcode', 'postcode'], 'values' => [F::POSTCODE_RAW, 'bs1 4dj']],
            ['field' => 'country', 'phrases' => ['my country', 'country'], 'values' => ['united kingdom', 'england']],
            ['field' => 'structured_data.address_line_1', 'phrases' => ['my address', 'address line 1', 'street address'], 'values' => [F::ADDRESS_RAW, '14 church street']],
            ['field' => 'structured_data.state_region', 'phrases' => ['my region', 'state region', 'county'], 'values' => [strtolower(F::COUNTY_PRIMARY), strtolower(F::COUNTY_SECONDARY)]],
        ];
        $verbs = ['update', 'set', 'change'];

        foreach ($fields as $spec) {
            foreach ($spec['phrases'] as $phrase) {
                foreach ($spec['values'] as $value) {
                    foreach ($verbs as $verb) {
                        $message = "{$verb} {$phrase} to {$value}";
                        $scenarios[] = self::directScenario(
                            id: 'direct_'.$spec['field'].'_'.$verb.'_'.substr(md5($message), 0, 8),
                            message: $message,
                            expectField: $spec['field'],
                            expectValue: self::polishedExpectation($spec['field'], $value),
                        );
                    }
                }
            }
        }

        $scenarios[] = self::directScenario(
            id: 'direct_multi_name_address',
            message: 'update my name to '.F::PERSON_LOWER.' and my address to '.F::ADDRESS_RAW,
            expect: [
                ['field' => 'full_name', 'value' => F::PERSON],
                ['field' => 'structured_data.address_line_1', 'value' => F::ADDRESS_LINE],
            ],
        );

        $scenarios[] = self::directScenario(
            id: 'direct_blank_region_combo',
            message: 'address blank, region '.F::COUNTY_SECONDARY,
            expect: [
                ['field' => 'structured_data.address_line_1', 'value' => ''],
                ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
            ],
        );

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function mustNotParseScenarios(): array
    {
        $messages = [
            'where is the apply button',
            'where is hte apply button',
            'why cant i see apply',
            'how do i apply these changes',
            'what should I put in the location field?',
            'can you help me improve my cv?',
            'how does my summary look?',
            'im testing the extension please do',
            'update my profile fields to random values',
            'update my location field though',
            'update my location field too',
            'update all location fields too',
            'thanks',
            'hi there',
            'hello',
            'apply it',
            'do you support markdown?',
            'why did my name become where is the apply button',
            'where is my location field',
            'is there an undo button',
            'what fields can you update',
            'can you see my profile',
            'draft an answer about motivation',
            'help me write a cover letter',
            'what is my current location',
            'show me my profile',
            'why are there no apply tags',
            'the button is missing',
            'i cant find apply all',
            'please explain how this works',
            'what does apply do',
            'should i click view or apply',
            'are these changes saved already',
            'did it work',
            'nothing happened when i clicked send',
        ];

        $scenarios = [];

        foreach ($messages as $index => $message) {
            $scenarios[] = [
                'id' => 'no_parse_'.($index + 1),
                'category' => 'must_not_parse',
                'conversation' => [['role' => 'user', 'content' => $message]],
                'assistant' => '',
                'extracted' => [],
                'must_be_empty' => true,
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function followUpNameScenarios(): array
    {
        $names = [F::NAME_JORDAN, F::NAME_SAM, F::PERSON, F::NAME_CASEY, F::NAME_RILEY];
        $scenarios = [];

        foreach ($names as $index => $name) {
            $scenarios[] = [
                'id' => 'follow_up_name_'.($index + 1),
                'category' => 'follow_up_name',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my name to '.F::NAME_JORDAN_PARTIAL],
                    ['role' => 'assistant', 'content' => 'I can update your full name to '.F::NAME_JORDAN_PARTIAL.'.'],
                    ['role' => 'user', 'content' => $name],
                ],
                'assistant' => "I will update your full name to {$name}.",
                'extracted' => [['field' => 'full_name', 'value' => $name]],
                'expect' => [['field' => 'full_name', 'value' => $name]],
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function assistantProposalScenarios(): array
    {
        return [
            [
                'id' => 'proposal_cleared_address',
                'category' => 'assistant_proposal',
                'conversation' => [['role' => 'user', 'content' => 'clear my old street address']],
                'assistant' => 'Your address line 1 will be cleared, and your state/region will be set to '.F::COUNTY_SECONDARY.'.',
                'extracted' => [
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
                'expect' => [
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
            ],
            [
                'id' => 'proposal_location_update',
                'category' => 'assistant_proposal',
                'conversation' => [['role' => 'user', 'content' => 'move my location to '.F::TOWN_HARBOR]],
                'assistant' => 'Your location will be updated to '.F::LOCATION_HARBOR.'.',
                'extracted' => [['field' => 'location', 'value' => F::LOCATION_HARBOR]],
                'expect' => [['field' => 'location', 'value' => F::LOCATION_HARBOR]],
            ],
            [
                'id' => 'proposal_name_update',
                'category' => 'assistant_proposal',
                'conversation' => [['role' => 'user', 'content' => 'change my name']],
                'assistant' => 'Your full name will be updated to '.F::NAME_SAM.'.',
                'extracted' => [['field' => 'full_name', 'value' => F::NAME_SAM]],
                'expect' => [['field' => 'full_name', 'value' => F::NAME_SAM]],
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function uiAndMetaQuestionScenarios(): array
    {
        $assistantLists = [
            "Got it. I'll update your profile fields for testing.\n\n- Full name: ".F::NAME_SAM."\n- Headline: Full Stack Developer\n- Location: ".F::CITY_EAST.', UK',
            "Here is what I'll change:\n\n- Full name: ".F::NAME_SAM."\n- City: ".F::CITY_EAST."\n- Summary: Backend engineer with Laravel experience.",
            'Your name will update to '.F::PERSON.' and your address to '.F::ADDRESS_FULL_FORMATTED.'.',
        ];

        $userQuestions = [
            'where is the apply button',
            'where is hte apply button',
            'why cant i see the apply tags',
            'how do i save these',
            'where did the buttons go',
        ];

        $scenarios = [];
        $counter = 0;

        foreach ($assistantLists as $assistant) {
            foreach ($userQuestions as $question) {
                $counter++;
                $scenarios[] = [
                    'id' => 'ui_question_'.$counter,
                    'category' => 'ui_question_after_proposal',
                    'conversation' => [
                        ['role' => 'user', 'content' => 'im testing the extension please do'],
                        ['role' => 'assistant', 'content' => $assistant],
                        ['role' => 'user', 'content' => $question],
                    ],
                    'assistant' => 'The Apply button appears inside my reply after I describe the changes.',
                    'extracted' => [],
                    'must_be_empty' => true,
                    'forbid' => ['full_name', 'headline', 'location', 'summary', 'structured_data.address_line_1'],
                ];
            }
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function complexMultiTurnScenarios(): array
    {
        return [
            [
                'id' => 'complex_move_then_location_field_too',
                'category' => 'complex_multi_turn',
                'conversation' => [
                    [
                        'role' => 'user',
                        'content' => 'update my name to '.F::PERSON_LOWER.' and my address to '.F::ADDRESS_FULL_RAW,
                    ],
                    [
                        'role' => 'assistant',
                        'content' => 'Your name will update to '.F::PERSON.' and your address to '.F::ADDRESS_FULL_FORMATTED.'.',
                    ],
                    ['role' => 'user', 'content' => 'update my location field though'],
                ],
                'assistant' => 'Your location field will update to '.F::LOCATION_PRIMARY.'.',
                'extracted' => [],
                'expect' => [
                    ['field' => 'location', 'value' => F::LOCATION_PRIMARY],
                    ['field' => 'city', 'value' => F::TOWN_PRIMARY],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_PRIMARY],
                ],
                'exact' => true,
            ],
            [
                'id' => 'complex_staged_address_then_city',
                'category' => 'complex_multi_turn',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my address to 10 church street'],
                    ['role' => 'assistant', 'content' => 'I will set your address line 1 to 10 Church Street.'],
                    ['role' => 'user', 'content' => 'and set my city to '.strtolower(F::TOWN_SECONDARY)],
                ],
                'assistant' => 'Your city will be updated to '.F::TOWN_SECONDARY.'.',
                'extracted' => [['field' => 'city', 'value' => F::TOWN_SECONDARY]],
                'expect' => [
                    ['field' => 'city', 'value' => F::TOWN_SECONDARY],
                ],
            ],
            [
                'id' => 'complex_question_then_real_update',
                'category' => 'complex_multi_turn',
                'conversation' => [
                    ['role' => 'user', 'content' => 'where is the apply button'],
                    ['role' => 'assistant', 'content' => 'Apply appears inside my reply when I propose profile changes.'],
                    ['role' => 'user', 'content' => 'ok update my city to '.F::CITY_SOUTH],
                ],
                'assistant' => 'Your city will update to '.F::CITY_SOUTH.'.',
                'extracted' => [['field' => 'city', 'value' => F::CITY_SOUTH]],
                'expect' => [['field' => 'city', 'value' => F::CITY_SOUTH]],
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function confirmationAndCorrectionScenarios(): array
    {
        $confirmations = ['do it', 'yes please', 'go ahead', 'apply it', 'make the changes', 'yes'];
        $scenarios = [];

        foreach ($confirmations as $index => $confirmation) {
            $scenarios[] = [
                'id' => 'confirm_extracted_'.($index + 1),
                'category' => 'confirmation_extracted',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my headline to Senior Laravel Developer'],
                    ['role' => 'assistant', 'content' => 'I can update your headline to Senior Laravel Developer.'],
                    ['role' => 'user', 'content' => $confirmation],
                ],
                'assistant' => 'Done. Tap Apply to save your headline.',
                'extracted' => [['field' => 'headline', 'value' => 'Senior Laravel Developer']],
                'expect' => [['field' => 'headline', 'value' => 'Senior Laravel Developer']],
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function extractedProposalScenarios(): array
    {
        $fields = [
            ['field' => 'full_name', 'value' => F::NAME_SAM],
            ['field' => 'headline', 'value' => 'Full Stack Developer | Python & React'],
            ['field' => 'summary', 'value' => 'Builder with experience in web development and cloud infrastructure.'],
            ['field' => 'location', 'value' => F::CITY_EAST.', UK'],
            ['field' => 'city', 'value' => F::CITY_EAST],
        ];

        $scenarios = [];

        foreach ($fields as $index => $fieldSpec) {
            $scenarios[] = [
                'id' => 'extracted_single_'.($index + 1),
                'category' => 'extracted_proposal',
                'conversation' => [
                    ['role' => 'user', 'content' => 'im testing the extension please do'],
                ],
                'assistant' => "I'll update your {$fieldSpec['field']} to {$fieldSpec['value']}. Tap Apply to save.",
                'extracted' => [$fieldSpec],
                'expect' => [$fieldSpec],
            ];
        }

        $scenarios[] = [
            'id' => 'extracted_multi_test_data',
            'category' => 'extracted_proposal',
            'conversation' => [
                ['role' => 'user', 'content' => 'update my profile fields to random values for testing'],
            ],
            'assistant' => "Got it. I'll update your profile for testing.\n\n- Full name: ".F::NAME_SAM."\n- Headline: Full Stack Developer\n- Location: ".F::CITY_EAST.', UK',
            'extracted' => [
                ['field' => 'full_name', 'value' => F::NAME_SAM],
                ['field' => 'headline', 'value' => 'Full Stack Developer'],
                ['field' => 'location', 'value' => F::CITY_EAST.', UK'],
            ],
            'expect' => [
                ['field' => 'full_name', 'value' => F::NAME_SAM],
                ['field' => 'headline', 'value' => 'Full Stack Developer'],
                ['field' => 'location', 'value' => F::CITY_EAST.', UK'],
            ],
        ];

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function locationBundleScenarios(): array
    {
        return [
            [
                'id' => 'location_move_to_harborford',
                'category' => 'location_bundle',
                'conversation' => [
                    ['role' => 'user', 'content' => 'move my location to '.F::TOWN_HARBOR],
                ],
                'assistant' => 'Your location will be updated to '.F::LOCATION_HARBOR.'.',
                'extracted' => [],
                'expect' => [
                    ['field' => 'location', 'value' => F::LOCATION_HARBOR],
                    ['field' => 'city', 'value' => F::TOWN_HARBOR],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_HARBOR],
                ],
                'exact' => true,
            ],
            [
                'id' => 'location_all_fields_millfield',
                'category' => 'location_bundle',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update all location fields to '.F::TOWN_SECONDARY],
                ],
                'assistant' => 'I will update your location fields for '.F::LOCATION_SECONDARY.'.',
                'extracted' => [],
                'expect' => [
                    ['field' => 'location', 'value' => F::LOCATION_SECONDARY],
                    ['field' => 'city', 'value' => F::TOWN_SECONDARY],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
                'exact' => true,
            ],
            [
                'id' => 'location_field_too_after_address',
                'category' => 'location_bundle',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my address to '.F::ADDRESS_FULL_RAW],
                    ['role' => 'assistant', 'content' => 'Your address will update to '.F::ADDRESS_FULL_FORMATTED.'.'],
                    ['role' => 'user', 'content' => 'update all location fields too'],
                ],
                'assistant' => 'Your location fields will align with '.F::LOCATION_PRIMARY.'.',
                'extracted' => [],
                'expect' => [
                    ['field' => 'location', 'value' => F::LOCATION_PRIMARY],
                    ['field' => 'city', 'value' => F::TOWN_PRIMARY],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_PRIMARY],
                ],
                'exact' => true,
            ],
            [
                'id' => 'location_proposal_all_fields_cleared_address',
                'category' => 'location_bundle',
                'conversation' => [
                    ['role' => 'user', 'content' => 'all of the location fields'],
                ],
                'assistant' => 'Your address line 1 will be cleared, and your state/region will be set to '.F::COUNTY_SECONDARY.'.',
                'extracted' => [
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
                'expect' => [
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
                'exact' => true,
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function correctionAndNegativeScenarios(): array
    {
        return [
            [
                'id' => 'correction_city_not_southford',
                'category' => 'correction',
                'conversation' => [
                    ['role' => 'user', 'content' => 'set my city to '.F::CITY_SOUTH],
                    ['role' => 'assistant', 'content' => 'Your city will update to '.F::CITY_SOUTH.'.'],
                    ['role' => 'user', 'content' => 'no I meant '.F::CITY_NORTH.' not '.F::CITY_SOUTH],
                ],
                'assistant' => 'Your city will update to '.F::CITY_NORTH.' instead.',
                'extracted' => [['field' => 'city', 'value' => F::CITY_NORTH]],
                'expect' => [['field' => 'city', 'value' => F::CITY_NORTH]],
            ],
            [
                'id' => 'correction_name_spelling',
                'category' => 'correction',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my name to '.F::NAME_SAM_TYPo],
                    ['role' => 'assistant', 'content' => 'Did you mean '.F::NAME_SAM.'?'],
                    ['role' => 'user', 'content' => 'yes '.F::NAME_SAM],
                ],
                'assistant' => 'Your full name will update to '.F::NAME_SAM.'.',
                'extracted' => [['field' => 'full_name', 'value' => F::NAME_SAM]],
                'expect' => [['field' => 'full_name', 'value' => F::NAME_SAM]],
            ],
            [
                'id' => 'negative_bare_name_without_context',
                'category' => 'negative_follow_up',
                'conversation' => [
                    ['role' => 'user', 'content' => 'how does my summary look?'],
                    ['role' => 'assistant', 'content' => 'Your summary reads well but could mention Laravel.'],
                    ['role' => 'user', 'content' => F::NAME_SAM],
                ],
                'assistant' => 'Did you want to update your full name to '.F::NAME_SAM.'?',
                'extracted' => [],
                'must_be_empty' => true,
                'forbid' => ['full_name'],
            ],
            [
                'id' => 'negative_bare_city_without_context',
                'category' => 'negative_follow_up',
                'conversation' => [
                    ['role' => 'user', 'content' => 'what is my current location'],
                    ['role' => 'assistant', 'content' => 'Your profile lists '.F::LOCATION_PRIMARY.'.'],
                    ['role' => 'user', 'content' => F::CITY_SOUTH],
                ],
                'assistant' => 'Did you want to change your location to '.F::CITY_SOUTH.'?',
                'extracted' => [],
                'must_be_empty' => true,
                'forbid' => ['city', 'location'],
            ],
            [
                'id' => 'ai_clear_street_address',
                'category' => 'ai_extraction',
                'conversation' => [['role' => 'user', 'content' => 'clear my old street address']],
                'assistant' => '',
                'extracted' => [['field' => 'structured_data.address_line_1', 'value' => '']],
                'expect' => [['field' => 'structured_data.address_line_1', 'value' => '']],
            ],
            [
                'id' => 'meta_location_field_too_empty_extraction',
                'category' => 'must_not_parse',
                'conversation' => [['role' => 'user', 'content' => 'update my location field too']],
                'assistant' => '',
                'extracted' => [],
                'must_be_empty' => true,
            ],
            [
                'id' => 'location_field_too_from_assistant_only',
                'category' => 'location_bundle',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my location field too'],
                ],
                'assistant' => 'Your location field will update to '.F::LOCATION_PRIMARY.' based on your address.',
                'extracted' => [['field' => 'location', 'value' => F::LOCATION_PRIMARY]],
                'expect' => [
                    ['field' => 'location', 'value' => F::LOCATION_PRIMARY],
                ],
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function helpAndDraftQuestionScenarios(): array
    {
        $questions = [
            'why do you need my cv',
            'what can you help me with',
            'can you write a cover letter for this role',
            'draft an answer about why I want to work here',
            'help me answer why I am leaving my current job',
            'what should I say about salary expectations',
            'how long should my summary be',
            'is my headline too long',
            'review my experience section',
            'what skills am I missing for backend roles',
            'explain what extra context is for',
            'how do I upload a new cv',
            'can you read my pdf cv',
            'what does willing to relocate mean on forms',
            'should I mention visa sponsorship',
            'write a first person answer about teamwork',
            'help me describe my laravel experience',
            'what is a good headline for product roles',
            'compare my profile to this job description',
            'summarise my profile in three sentences',
            'do I need a linkedin url',
            'what postcode format should I use',
            'how do I undo a profile change',
            'are you connected to my dashboard',
            'why is the assistant slow',
            'can you remember previous chats',
            'what model are you',
            'tell me a joke',
            'good morning',
            'cheers',
            'never mind',
            'forget what I just said',
            'stop suggesting changes',
            'I changed my mind',
            'actually ignore that',
            'what happens if I click view instead of apply',
            'will employers see these changes',
            'is my data private',
            'how do profile apply tags work',
            'what fields can you update',
            'can you update my skills section',
            'help me tailor my cv for fintech',
            'should I include remote work preference',
            'what does notice period mean',
            'how do I change my default cover letter tone',
            'can you suggest a better headline',
            'rewrite my summary for senior roles',
            'what is the difference between city and location',
            'do I need to fill in state region',
            'how do I add extra context for recruiters',
            'can you help with a competency question',
            'draft a response about leadership experience',
            'help me answer a strengths and weaknesses question',
            'what should I put in additional information',
            'how many years of experience should I list',
            'can you check my spelling',
            'is my email professional enough',
            'should I add my github url',
            'what portfolio links matter for backend jobs',
            'how do I describe a career break',
            'help me explain a short tenure',
            'can you suggest keywords for ATS',
            'what tone should cover letters use',
            'how formal should application answers be',
            'can you help with a video interview script',
            'what should I wear to an interview',
            'how do I follow up after applying',
            'when should I send a thank you email',
            'can you help negotiate salary',
            'what benefits should I ask about',
            'how do I decline a job offer politely',
            'can you explain equity compensation',
            'what is a reasonable notice period in the uk',
            'should I mention side projects',
            'how do I list freelance work',
            'can you help with contractor vs permanent wording',
            'what if I have gaps in employment',
            'help me describe remote collaboration',
            'how do I show impact with metrics',
            'can you suggest action verbs for my cv',
            'what length should bullet points be',
            'should I include references on my cv',
            'how do I format phone numbers for uk employers',
            'can you explain right to work questions',
            'what does hybrid working mean on forms',
            'help me answer availability to start',
            'how soon can I start if asked',
            'can you draft a message to a recruiter',
            'what should I say when open to relocation',
            'help me answer why this company',
            'how do I mention certifications',
            'should I list every technology I touched',
            'can you prioritise skills for this role',
            'what if the form asks for preferred name',
            'help me answer disability disclosure questions',
            'how do I handle criminal record declarations',
            'can you explain background check questions',
            'what does reasonable adjustments mean',
            'help me write a personal statement',
            'how do I answer motivation questions briefly',
            'can you suggest questions to ask the interviewer',
            'what research should I do before applying',
            'how do I mention open source contributions',
            'should I include volunteer work',
            'help me describe mentoring experience',
            'can you simplify technical jargon for hr screens',
            'what if the job asks for a portfolio password',
            'how do I attach documents in the extension',
            'why did my last apply fail',
            'can you explain profile sync',
            'what happens after I click apply on a tag',
            'how do I revert an applied change',
            'can I apply only some suggested fields',
            'why are there view and apply buttons',
            'does the assistant auto save my profile',
            'how often should I refresh my cv',
            'can you help prioritise which fields to fix first',
            'what makes a strong professional summary',
            'help me answer conflict resolution questions',
            'how do I describe stakeholder management',
            'can you draft an answer about deadlines',
            'what if I lack a required qualification',
            'help me frame transferable skills',
            'how do I mention training courses',
            'should I list soft skills separately',
            'can you help with personality test questions',
            'what is situational judgement in applications',
            'help me answer teamwork without sounding generic',
            'how do I show continuous learning',
            'can you explain pro features',
            'what counts as a cv parse',
            'how do fair use limits work',
            'thanks for your help',
            'that is all for now',
            'no further changes needed',
            'please stop updating my profile',
            'just answer my question no profile changes',
            'I only wanted advice not edits',
            'do not change anything on my profile',
            'read only mode please',
            'explain without suggesting apply actions',
            'where do I find my dashboard profile',
            'how do I edit experience manually',
            'can I override assistant suggestions',
            'what if apply shows the wrong value',
            'help me understand structured address fields',
            'why is my postcode formatted differently',
            'can you compare two headline options',
            'which summary version sounds better',
            'help me pick between two cities for my profile',
            'should I list both contract and permanent preferences',
            'how do application settings affect autofill',
            'what does default work authorization mean',
            'help me answer sponsorship questions honestly',
            'can you draft a polite withdrawal email',
            'how do I explain a pending notice period',
            'what if I am still employed but interviewing',
            'help me describe on call experience',
            'how do I mention security clearance without details',
            'can you help with behavioural star answers',
            'what is a good length for cover letter paragraphs',
            'should I repeat my cv in the cover letter',
            'help me connect my experience to this job title',
            'how do I mention salary history questions',
            'can you explain total compensation packages',
            'what if the salary field is mandatory',
            'help me answer desired hours per week',
            'how do I describe part time availability',
            'can you help with internship applications as a senior',
            'what if I am overqualified',
            'help me address employment gaps due to health',
            'how do I mention caring responsibilities briefly',
            'can you suggest neutral wording for leaving a toxic workplace',
            'what should I avoid saying in application forms',
            'help me answer why this role at this level',
            'how do I show progression between roles',
            'can you help merge two job descriptions into one answer',
            'what if the question limit is 500 characters',
            'help me shorten an answer without losing meaning',
            'how do I cite metrics credibly',
            'can you check if my headline matches the job title',
            'should I mirror the employer job title exactly',
            'help me answer language proficiency questions',
            'how do I list bilingual skills',
            'can you draft answers in first person present tense',
            'what if they ask for third person bio',
            'help me write a short bio for a portal',
            'how do I mention relocation timeline',
            'can you explain commute willingness questions',
            'what does within 30 miles mean practically',
            'help me answer driving licence questions',
            'how do I mention travel requirements',
            'can you help with shift pattern questions',
            'what if I need flexible hours',
            'help me describe async communication skills',
            'how do I show documentation habits',
            'can you suggest portfolio project descriptions',
            'what if the form has duplicate fields',
            'help me understand which profile field maps to city',
            'why did location update several fields at once',
            'can you explain smart location updates',
            'what triggers multiple apply tags',
            'how do I update only my city not full location',
            'help me fix a wrong county after moving',
            'should I clear old address when relocating',
            'can you explain when address line 1 clears automatically',
            'what if I only want to change postcode',
            'help me update country after moving abroad',
            'how do I keep uk phone format on international forms',
            'can you help with us style state fields',
            'what if the employer uses zip not postcode',
            'help me answer veteran status questions',
            'how do I handle ethnicity monitoring optional fields',
            'can you explain equal opportunities forms',
            'what if I prefer not to disclose',
            'help me answer gender questions on forms',
            'how do I list pronouns professionally',
            'can you draft a diversity statement',
            'what should I put in additional comments',
            'help me answer how did you hear about us',
            'how do I mention employee referral',
            'can you help with internal transfer applications',
            'what if I already applied on the company site',
            'help me avoid duplicate applications',
            'how do I track applications in the dashboard',
            'can you summarise what we changed today',
            'what profile fields did we not touch',
            'confirm you will not update my profile for this question',
        ];

        $scenarios = [];

        foreach ($questions as $index => $question) {
            $scenarios[] = [
                'id' => 'help_draft_'.($index + 1),
                'category' => 'help_and_draft',
                'conversation' => [['role' => 'user', 'content' => $question]],
                'assistant' => 'Happy to help with that in plain text.',
                'extracted' => [],
                'must_be_empty' => true,
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function aiExtractionPhrasingScenarios(): array
    {
        $templates = [
            ['message' => 'please update my city to '.strtolower(F::CITY_NORTH), 'field' => 'city', 'raw' => F::CITY_NORTH],
            ['message' => 'could you change my headline to Backend Engineer', 'field' => 'headline', 'raw' => 'Backend Engineer'],
            ['message' => 'i want my email to be '.F::EMAIL, 'field' => 'email', 'raw' => F::EMAIL],
            ['message' => 'make my phone +44 7700 900456', 'field' => 'phone', 'raw' => '+44 7700 900456'],
            ['message' => 'set postcode to '.F::POSTCODE_RAW, 'field' => 'postcode', 'raw' => F::POSTCODE_FORMATTED],
            ['message' => 'change my country to united kingdom', 'field' => 'country', 'raw' => 'United Kingdom'],
            ['message' => 'update my linkedin to https://linkedin.com/in/example-user', 'field' => 'linkedin_url', 'raw' => 'https://linkedin.com/in/example-user'],
            ['message' => 'set my website to https://example.dev', 'field' => 'website_url', 'raw' => 'https://example.dev'],
            ['message' => 'please set my summary to Backend engineer focused on APIs.', 'field' => 'summary', 'raw' => 'Backend engineer focused on APIs.'],
            ['message' => 'can you update my name to '.F::PERSON_LOWER.' please', 'field' => 'full_name', 'raw' => F::PERSON],
            ['message' => 'id like my location to be '.strtolower(F::LOCATION_SECONDARY), 'field' => 'location', 'raw' => F::LOCATION_SECONDARY],
            ['message' => 'put '.F::ADDRESS_RAW.' as my address', 'field' => 'structured_data.address_line_1', 'raw' => F::ADDRESS_LINE],
        ];

        $scenarios = [];

        foreach ($templates as $index => $template) {
            $value = self::polishedExpectation($template['field'], $template['raw']);
            $expect = [['field' => $template['field'], 'value' => $value]];

            $scenarios[] = [
                'id' => 'ai_phrasing_'.($index + 1),
                'category' => 'ai_extraction_phrasing',
                'conversation' => [['role' => 'user', 'content' => $template['message']]],
                'assistant' => 'I will update that field for you.',
                'extracted' => $expect,
                'expect' => $expect,
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function clearFieldScenarios(): array
    {
        $clears = [
            ['message' => 'clear my address line 1', 'field' => 'structured_data.address_line_1'],
            ['message' => 'blank my street address', 'field' => 'structured_data.address_line_1'],
            ['message' => 'empty my headline', 'field' => 'headline'],
            ['message' => 'remove my website url', 'field' => 'website_url'],
            ['message' => 'clear my linkedin', 'field' => 'linkedin_url'],
            ['message' => 'delete my extra context', 'field' => 'extra_context'],
            ['message' => 'clear address line 1 and set region to '.F::COUNTY_PRIMARY, 'field' => 'structured_data.state_region', 'extra' => [
                ['field' => 'structured_data.address_line_1', 'value' => ''],
                ['field' => 'structured_data.state_region', 'value' => F::COUNTY_PRIMARY],
            ]],
        ];

        $scenarios = [];

        foreach ($clears as $index => $clear) {
            $expect = $clear['extra'] ?? [['field' => $clear['field'], 'value' => '']];

            $scenarios[] = [
                'id' => 'clear_field_'.($index + 1),
                'category' => 'clear_field',
                'conversation' => [['role' => 'user', 'content' => $clear['message']]],
                'assistant' => 'I will clear that field.',
                'extracted' => $expect,
                'expect' => $expect,
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function preferenceUpdateScenarios(): array
    {
        $updates = [
            ['field' => 'application_settings.expected_salary', 'message' => 'set my expected salary to 65000', 'value' => '65000'],
            ['field' => 'application_settings.visa_sponsorship', 'message' => 'update visa sponsorship to no', 'value' => 'no'],
            ['field' => 'application_settings.willing_to_relocate', 'message' => 'set willing to relocate to yes', 'value' => 'yes'],
            ['field' => 'application_settings.drivers_license', 'message' => 'change driving licence to full uk', 'value' => 'full uk'],
            ['field' => 'application_settings.legally_authorized', 'message' => 'set legally authorized to yes', 'value' => 'yes'],
            ['field' => 'application_settings.years_of_experience', 'message' => 'update years of experience to 8', 'value' => '8'],
        ];

        $scenarios = [];

        foreach ($updates as $index => $update) {
            $expect = [['field' => $update['field'], 'value' => $update['value']]];

            $scenarios[] = [
                'id' => 'preference_'.($index + 1),
                'category' => 'preference_update',
                'conversation' => [['role' => 'user', 'content' => $update['message']]],
                'assistant' => 'I will update your preference.',
                'extracted' => $expect,
                'expect' => $expect,
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function extendedMultiTurnScenarios(): array
    {
        return [
            [
                'id' => 'extended_headline_then_summary_then_confirm',
                'category' => 'extended_multi_turn',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my headline to Senior PHP Developer'],
                    ['role' => 'assistant', 'content' => 'I can update your headline to Senior PHP Developer.'],
                    ['role' => 'user', 'content' => 'also tighten my summary for backend roles'],
                    ['role' => 'assistant', 'content' => 'I can shorten your summary to highlight Laravel APIs.'],
                    ['role' => 'user', 'content' => 'yes please do both'],
                ],
                'assistant' => 'Done. Apply both changes below.',
                'extracted' => [
                    ['field' => 'headline', 'value' => 'Senior PHP Developer'],
                    ['field' => 'summary', 'value' => 'Backend engineer specialising in Laravel APIs and queue workers.'],
                ],
                'expect' => [
                    ['field' => 'headline', 'value' => self::polishedExpectation('headline', 'Senior PHP Developer')],
                    ['field' => 'summary', 'value' => 'Backend engineer specialising in Laravel APIs and queue workers.'],
                ],
                'exact' => true,
            ],
            [
                'id' => 'extended_relocate_clear_address_confirm',
                'category' => 'extended_multi_turn',
                'conversation' => [
                    ['role' => 'user', 'content' => 'I am moving to '.F::TOWN_SECONDARY],
                    ['role' => 'assistant', 'content' => 'I can update your location fields for '.F::TOWN_SECONDARY.'.'],
                    ['role' => 'user', 'content' => 'clear my old address too'],
                    ['role' => 'assistant', 'content' => 'I will clear address line 1 and update location fields.'],
                    ['role' => 'user', 'content' => 'go ahead'],
                ],
                'assistant' => 'Your location fields will update to '.F::LOCATION_SECONDARY.' and address line 1 will clear.',
                'extracted' => [
                    ['field' => 'location', 'value' => F::LOCATION_SECONDARY],
                    ['field' => 'city', 'value' => F::TOWN_SECONDARY],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                ],
                'expect' => [
                    ['field' => 'location', 'value' => F::LOCATION_SECONDARY],
                    ['field' => 'city', 'value' => F::TOWN_SECONDARY],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                ],
                'exact' => true,
            ],
            [
                'id' => 'extended_wrong_field_then_correction',
                'category' => 'extended_multi_turn',
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my city to '.F::CITY_SOUTH],
                    ['role' => 'assistant', 'content' => 'Your city will update to '.F::CITY_SOUTH.'.'],
                    ['role' => 'user', 'content' => 'wait I meant '.F::CITY_NORTH],
                    ['role' => 'assistant', 'content' => 'No problem, I will use '.F::CITY_NORTH.' instead.'],
                    ['role' => 'user', 'content' => 'yes that one'],
                ],
                'assistant' => 'Your city will update to '.F::CITY_NORTH.'.',
                'extracted' => [['field' => 'city', 'value' => F::CITY_NORTH]],
                'expect' => [['field' => 'city', 'value' => F::CITY_NORTH]],
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function relocationPhrasingScenarios(): array
    {
        $phrases = [
            'move my location to '.F::TOWN_HARBOR,
            'relocate to '.F::TOWN_SECONDARY,
            'moving to '.F::TOWN_PRIMARY,
            'update all location fields to '.F::TOWN_SECONDARY,
            'change my city and location to '.F::TOWN_HARBOR,
            'I have moved to '.F::TOWN_PRIMARY,
            'please update my location to '.F::TOWN_HARBOR,
            'set my town to '.F::TOWN_SECONDARY,
            'update my location on my profile to '.F::TOWN_SECONDARY,
            'move near '.F::TOWN_HARBOR,
        ];

        $bundles = [
            F::MOCK_KEY_HARBOR => [
                ['field' => 'location', 'value' => F::LOCATION_HARBOR],
                ['field' => 'city', 'value' => F::TOWN_HARBOR],
                ['field' => 'structured_data.state_region', 'value' => F::COUNTY_HARBOR],
            ],
            F::MOCK_KEY_SECONDARY => [
                ['field' => 'location', 'value' => F::LOCATION_SECONDARY],
                ['field' => 'city', 'value' => F::TOWN_SECONDARY],
                ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
            ],
            F::MOCK_KEY_PRIMARY => [
                ['field' => 'location', 'value' => F::LOCATION_PRIMARY],
                ['field' => 'city', 'value' => F::TOWN_PRIMARY],
                ['field' => 'structured_data.state_region', 'value' => F::COUNTY_PRIMARY],
            ],
        ];

        $scenarios = [];

        foreach ($phrases as $index => $phrase) {
            $key = match (true) {
                str_contains(strtolower($phrase), F::MOCK_KEY_HARBOR) => F::MOCK_KEY_HARBOR,
                str_contains(strtolower($phrase), F::MOCK_KEY_SECONDARY) => F::MOCK_KEY_SECONDARY,
                default => F::MOCK_KEY_PRIMARY,
            };

            $expect = $bundles[$key];

            $scenarios[] = [
                'id' => 'relocation_phrase_'.($index + 1),
                'category' => 'relocation_phrasing',
                'conversation' => [['role' => 'user', 'content' => $phrase]],
                'assistant' => 'I will update your location fields accordingly.',
                'extracted' => [],
                'expect' => $expect,
                'exact' => true,
            ];
        }

        return $scenarios;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function megaChangeRequestScenarios(): array
    {
        $contactAndLocationRaw = [
            ['field' => 'email', 'value' => F::EMAIL],
            ['field' => 'phone', 'value' => '+44 7700 900123'],
            ['field' => 'headline', 'value' => 'Senior Laravel Developer'],
            ['field' => 'summary', 'value' => 'Backend engineer focused on APIs and queue workers.'],
            ['field' => 'linkedin_url', 'value' => 'https://linkedin.com/in/example-user'],
            ['field' => 'location', 'value' => F::LOCATION_HARBOR],
            ['field' => 'city', 'value' => F::TOWN_HARBOR],
            ['field' => 'structured_data.state_region', 'value' => F::COUNTY_HARBOR],
            ['field' => 'postcode', 'value' => F::POSTCODE_RAW],
            ['field' => 'country', 'value' => 'united kingdom'],
        ];

        $contactAndLocationExpect = array_map(
            static fn (array $update): array => [
                'field' => $update['field'],
                'value' => self::polishedExpectation($update['field'], (string) $update['value']),
            ],
            $contactAndLocationRaw,
        );

        $withClearAndPrefsRaw = [
            ...$contactAndLocationRaw,
            ['field' => 'structured_data.address_line_1', 'value' => ''],
            ['field' => 'application_settings.willing_to_relocate', 'value' => 'yes'],
            ['field' => 'application_settings.legally_authorized', 'value' => 'yes'],
        ];

        $withClearAndPrefsExpect = array_map(
            static fn (array $update): array => [
                'field' => $update['field'],
                'value' => self::polishedExpectation($update['field'], (string) $update['value']),
            ],
            $withClearAndPrefsRaw,
        );

        return [
            [
                'id' => 'extended_mega_relocate_profile_refresh',
                'category' => 'mega_change_request',
                'conversation' => [
                    [
                        'role' => 'user',
                        'content' => 'I am moving to '.F::TOWN_HARBOR.' next month. Update my profile for UK applications with new contact details and location. Clear my old street address.',
                    ],
                    [
                        'role' => 'assistant',
                        'content' => 'I can refresh your contact block and location fields for '.F::LOCATION_HARBOR.'. What email and phone should I use?',
                    ],
                    [
                        'role' => 'user',
                        'content' => 'email '.F::EMAIL.', phone +44 7700 900123, headline Senior Laravel Developer, summary Backend engineer focused on APIs and queue workers., linkedin https://linkedin.com/in/example-user, postcode '.F::POSTCODE_RAW.', country united kingdom',
                    ],
                    [
                        'role' => 'assistant',
                        'content' => 'I will update your contact details, location fields for '.F::LOCATION_HARBOR.', and clear your old address line.',
                    ],
                    ['role' => 'user', 'content' => 'yes go ahead with all of that'],
                ],
                'assistant' => 'Done — ten profile updates are ready to apply below.',
                'extracted' => $contactAndLocationRaw,
                'expect' => $contactAndLocationExpect,
                'exact' => true,
            ],
            [
                'id' => 'extended_mega_relocate_with_clear_and_prefs',
                'category' => 'mega_change_request',
                'conversation' => [
                    [
                        'role' => 'user',
                        'content' => 'moving to '.F::TOWN_HARBOR.', clear my old address, set willing to relocate and legally authorized to yes, and update email '.F::EMAIL.', phone +44 7700 900123, headline Senior Laravel Developer, summary Backend engineer focused on APIs and queue workers., linkedin https://linkedin.com/in/example-user, postcode '.F::POSTCODE_RAW.', country united kingdom',
                    ],
                    ['role' => 'assistant', 'content' => 'I will apply all twelve updates for your Harborford move.'],
                    ['role' => 'user', 'content' => 'go ahead'],
                ],
                'assistant' => 'All twelve profile updates are ready — tap Apply on each tag.',
                'extracted' => $withClearAndPrefsRaw,
                'expect' => $withClearAndPrefsExpect,
                'exact' => true,
            ],
            [
                'id' => 'mega_single_turn_full_contact_block',
                'category' => 'mega_change_request',
                'conversation' => [
                    [
                        'role' => 'user',
                        'content' => 'update email to '.F::EMAIL.', phone to +44 7700 900123, headline to Senior Laravel Developer, summary to Backend engineer focused on APIs and queue workers., linkedin to https://linkedin.com/in/example-user, location to '.strtolower(F::LOCATION_HARBOR).', city to '.strtolower(F::TOWN_HARBOR).', region to '.strtolower(F::COUNTY_HARBOR).', postcode to '.F::POSTCODE_RAW.', and country to united kingdom',
                    ],
                ],
                'assistant' => 'I will update all ten profile fields you listed.',
                'extracted' => $contactAndLocationRaw,
                'expect' => $contactAndLocationExpect,
                'exact' => true,
            ],
        ];
    }

    /**
     * @param  array<int, array{field: string, value: string}>  $expect
     * @return array<string, mixed>
     */
    private static function directScenario(
        string $id,
        string $message,
        ?string $expectField = null,
        ?string $expectValue = null,
        array $expect = [],
    ): array {
        if ($expectField !== null && $expectValue !== null) {
            $expect = [['field' => $expectField, 'value' => $expectValue]];
        }

        return [
            'id' => $id,
            'category' => 'direct_update',
            'conversation' => [['role' => 'user', 'content' => $message]],
            'assistant' => '',
            'expect' => $expect,
            'extracted' => $expect,
        ];
    }

    private static function polishedExpectation(string $field, string $value): string
    {
        return ProfileUpdateValueFormatter::format($field, $value);
    }
}
