<?php

namespace Tests\Unit\Services;

use App\Services\AssistAnswerQualityScorer;
use App\Services\NanoGptService;
use Tests\TestCase;

class AssistAnswerQualityScorerTest extends TestCase
{
    public function test_average_scores_and_score_100(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $average = $scorer->averageScores([
            'quality' => 4,
            'answered_question' => 5,
            'non_ai_phrasing' => 3,
            'tone_match' => 4,
            'grounding' => 5,
            'conciseness' => 4,
        ]);

        $this->assertSame(4.17, $average);
        $this->assertSame(83, $scorer->toScore100($average));
    }

    public function test_passes_threshold_requires_answered_grounding_and_mechanical(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $this->assertFalse($scorer->passesThreshold([
            'quality' => 5,
            'answered_question' => 2,
            'non_ai_phrasing' => 5,
            'tone_match' => 5,
            'grounding' => 5,
            'conciseness' => 5,
        ]));

        $this->assertFalse($scorer->passesThreshold([
            'quality' => 5,
            'answered_question' => 5,
            'non_ai_phrasing' => 5,
            'tone_match' => 5,
            'grounding' => 2,
            'conciseness' => 5,
        ]));

        $this->assertTrue($scorer->passesThreshold([
            'quality' => 4,
            'answered_question' => 4,
            'non_ai_phrasing' => 4,
            'tone_match' => 4,
            'grounding' => 4,
            'conciseness' => 4,
        ], mechanical: ['passed' => true]));
    }

    public function test_mechanical_checks_flag_ai_phrases_and_empty_responses(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $empty = $scorer->mechanicalChecks('', [
            'response_style' => 'form_answer',
            'tone' => ['locale' => 'en-GB'],
        ]);

        $this->assertFalse($empty['passed']);
        $this->assertContains('Empty response', $empty['failure_reasons']);

        $ai = $scorer->mechanicalChecks(
            'I am thrilled to apply with a proven track record at Riverbank Systems.',
            [
                'response_style' => 'form_answer',
                'tone' => ['locale' => 'en-GB'],
                'must_mention' => ['Riverbank Systems'],
            ],
        );

        $this->assertFalse($ai['passed']);
        $this->assertFalse($ai['ai_phrases_ok']);
    }

    public function test_mechanical_checks_flag_third_person_preface_and_us_spelling_in_uk_tone(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $thirdPerson = $scorer->mechanicalChecks(
            'Based on your profile, James Mitchell is a senior Laravel developer.',
            [
                'response_style' => 'form_answer',
                'tone' => ['locale' => 'en-GB'],
            ],
        );

        $this->assertFalse($thirdPerson['passed']);

        $usSpelling = $scorer->mechanicalChecks(
            'I led migration work at Riverbank Systems and optimized billing organization.',
            [
                'response_style' => 'form_answer',
                'tone' => ['locale' => 'en-GB'],
                'must_mention' => ['Riverbank Systems'],
            ],
        );

        $this->assertFalse($usSpelling['passed']);
    }

    public function test_mechanical_checks_require_yes_no_for_screening(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $failed = $scorer->mechanicalChecks(
            'I prefer to stay in Bristol.',
            [
                'response_style' => 'form_answer',
                'tone' => ['locale' => 'en-GB'],
                'screening_format' => 'yes_no',
            ],
        );

        $this->assertFalse($failed['passed']);

        $passed = $scorer->mechanicalChecks(
            'No - I am not looking to relocate from Bristol.',
            [
                'response_style' => 'form_answer',
                'tone' => ['locale' => 'en-GB'],
                'screening_format' => 'yes_no',
            ],
        );

        $this->assertTrue($passed['passed']);
    }

    public function test_apply_ai_phrase_penalties_caps_non_ai_phrasing(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $scores = $scorer->applyAiPhrasePenalties(
            array_fill_keys(AssistAnswerQualityScorer::DIMENSIONS, 5),
            [
                'hard' => ['i am thrilled to apply', 'proven track record'],
                'soft' => ['leverage'],
            ],
        );

        $this->assertSame(1, $scores['non_ai_phrasing']);
    }

    public function test_summarize_report_counts_pass_rate(): void
    {
        $scorer = app(AssistAnswerQualityScorer::class);

        $summary = $scorer->summarizeReport([
            [
                'passed' => true,
                'score_100' => 100,
                'scores' => array_fill_keys(AssistAnswerQualityScorer::DIMENSIONS, 5),
            ],
            [
                'passed' => false,
                'score_100' => 40,
                'scores' => array_fill_keys(AssistAnswerQualityScorer::DIMENSIONS, 2),
            ],
        ]);

        $this->assertSame(2, $summary['total']);
        $this->assertSame(1, $summary['passed']);
        $this->assertSame(0.5, $summary['pass_rate']);
        $this->assertSame(70, $summary['average_score_100']);
    }

    public function test_score_batch_parses_alternate_judge_response_shape(): void
    {
        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'scores' => [
                    [
                        'id' => 'scenario-a',
                        'relevance' => 1,
                        'accuracy' => 0.8,
                        'completeness' => 0.6,
                        'clarity' => 1,
                        'adherence_to_style' => 0.4,
                        'overall' => 0.72,
                        'feedback' => 'Mostly grounded.',
                    ],
                ],
            ]);
        });

        $scorer = app(AssistAnswerQualityScorer::class);
        $results = $scorer->scoreBatch([
            [
                'id' => 'scenario-a',
                'user_question' => 'Why this role?',
                'response' => 'I shipped Laravel APIs at Riverbank Systems.',
                'response_style' => 'form_answer',
                'profile' => ['full_name' => 'James Mitchell'],
                'tone' => ['locale' => 'en-GB'],
            ],
        ]);

        $this->assertStringContainsString('Mostly grounded', $results[0]['notes']);
        $this->assertGreaterThan(1, $results[0]['average']);
    }
}
