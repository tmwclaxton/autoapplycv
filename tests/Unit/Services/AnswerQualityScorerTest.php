<?php

namespace Tests\Unit\Services;

use App\Services\AnswerQualityScorer;
use Tests\TestCase;

class AnswerQualityScorerTest extends TestCase
{
    public function test_average_scores_across_dimensions(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $average = $scorer->averageScores([
            'grounding' => 4,
            'specificity' => 5,
            'human_tone' => 3,
            'terminology' => 4,
            'language' => 5,
            'conciseness' => 4,
            'honesty' => 5,
        ]);

        $this->assertSame(4.29, $average);
    }

    public function test_passes_threshold_requires_grounding_and_average(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $this->assertFalse($scorer->passesThreshold([
            'grounding' => 2,
            'specificity' => 5,
            'human_tone' => 5,
            'terminology' => 5,
            'language' => 5,
            'conciseness' => 5,
            'honesty' => 5,
        ]));

        $this->assertFalse($scorer->passesThreshold([
            'grounding' => 4,
            'specificity' => 3,
            'human_tone' => 3,
            'terminology' => 3,
            'language' => 3,
            'conciseness' => 3,
            'honesty' => 3,
        ]));

        $this->assertTrue($scorer->passesThreshold([
            'grounding' => 4,
            'specificity' => 4,
            'human_tone' => 4,
            'terminology' => 4,
            'language' => 5,
            'conciseness' => 4,
            'honesty' => 5,
        ]));
    }

    public function test_mechanical_checks_flag_missing_terms(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $failedMention = $scorer->mechanicalChecks(
            'I enjoy backend work.',
            ['Riverbank Systems'],
            [],
        );

        $this->assertFalse($failedMention['must_mention_ok']);
        $this->assertTrue($failedMention['ai_phrases_ok']);

        $failedBanned = $scorer->mechanicalChecks(
            'I have fintech experience at Riverbank Systems.',
            ['Riverbank Systems'],
            ['fintech'],
        );

        $this->assertFalse($failedBanned['must_not_mention_ok']);
    }

    public function test_mechanical_checks_flag_ai_phrases(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $failed = $scorer->mechanicalChecks(
            'I am thrilled to apply and bring a proven track record.',
            [],
            [],
        );

        $this->assertFalse($failed['ai_phrases_ok']);
        $this->assertContains('i am thrilled to apply', $failed['ai_phrase_hard']);
        $this->assertContains('proven track record', $failed['ai_phrase_hard']);
    }

    public function test_apply_ai_phrase_penalties_caps_human_tone(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $scores = $scorer->applyAiPhrasePenalties(
            array_fill_keys(AnswerQualityScorer::DIMENSIONS, 5),
            [
                'hard' => ['i am thrilled to apply', 'proven track record'],
                'soft' => ['leverage'],
            ],
        );

        $this->assertSame(1, $scores['human_tone']);
    }

    public function test_passes_threshold_fails_on_hard_ai_phrases(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $this->assertFalse($scorer->passesThreshold(
            array_fill_keys(AnswerQualityScorer::DIMENSIONS, 5),
            5.0,
            [
                'must_mention_ok' => true,
                'must_not_mention_ok' => true,
                'ai_phrases_ok' => false,
                'ai_phrase_hard' => ['i am excited to apply'],
                'ai_phrase_soft' => [],
                'ai_phrase_reason' => 'AI telltale phrase(s): i am excited to apply',
            ],
        ));
    }

    public function test_summarize_report_counts_pass_rate(): void
    {
        $scorer = app(AnswerQualityScorer::class);

        $summary = $scorer->summarizeReport([
            [
                'passed' => true,
                'scores' => array_fill_keys(AnswerQualityScorer::DIMENSIONS, 5),
            ],
            [
                'passed' => false,
                'scores' => array_fill_keys(AnswerQualityScorer::DIMENSIONS, 2),
            ],
        ]);

        $this->assertSame(2, $summary['total']);
        $this->assertSame(1, $summary['passed']);
        $this->assertSame(0.5, $summary['pass_rate']);
    }
}
