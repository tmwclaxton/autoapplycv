<?php

namespace Tests\Unit\Services;

use App\Services\AnswerFormatValidator;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerFormatValidatorTest extends TestCase
{
    private AnswerFormatValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = new AnswerFormatValidator;
    }

    #[Test]
    public function accepts_plain_yes_no(): void
    {
        $result = $this->validator->validate('No', [
            'answer_shape' => 'yes_no',
            'brevity' => 'minimal',
            'options' => ['Yes', 'No'],
            'max_words' => 1,
        ]);

        $this->assertTrue($result['passed'], implode(',', $result['failures']));
    }

    #[Test]
    public function rejects_essay_for_yes_no(): void
    {
        $result = $this->validator->validate(
            'I do not require sponsorship at this time as I am a UK citizen with the right to work.',
            [
                'answer_shape' => 'yes_no',
                'brevity' => 'minimal',
                'options' => ['Yes', 'No'],
                'max_words' => 1,
            ],
        );

        $this->assertFalse($result['passed']);
        $this->assertNotEmpty($result['failures']);
    }

    #[Test]
    public function accepts_digit_and_rejects_letters(): void
    {
        $scenario = [
            'answer_shape' => 'digit',
            'brevity' => 'minimal',
            'max_words' => 1,
            'must_match' => '/^\d+$/',
        ];

        $this->assertTrue($this->validator->validate('8', $scenario)['passed']);
        $this->assertFalse($this->validator->validate('eight years', $scenario)['passed']);
    }

    #[Test]
    public function rejects_salary_paragraph_for_currency(): void
    {
        $result = $this->validator->validate(
            'I am looking for a competitive salary around sixty five thousand depending on the role.',
            [
                'answer_shape' => 'currency',
                'brevity' => 'minimal',
                'max_words' => 3,
                'must_not_mention' => ['I am looking', 'depending on'],
            ],
        );

        $this->assertFalse($result['passed']);
    }

    #[Test]
    public function enforces_select_option_exact_match(): void
    {
        $scenario = [
            'answer_shape' => 'select_option',
            'brevity' => 'minimal',
            'options' => ['Remote', 'Hybrid', 'On-site'],
            'max_words' => 2,
        ];

        $this->assertTrue($this->validator->validate('Hybrid', $scenario)['passed']);
        $this->assertFalse($this->validator->validate('I prefer hybrid working', $scenario)['passed']);
    }

    #[Test]
    public function enforces_max_words_on_one_liner(): void
    {
        $scenario = [
            'answer_shape' => 'one_liner',
            'brevity' => 'brief',
            'max_words' => 3,
        ];

        $this->assertTrue($this->validator->validate('Senior Laravel Developer', $scenario)['passed']);
        $this->assertFalse($this->validator->validate('I am a senior laravel developer with many years', $scenario)['passed']);
    }

    #[Test]
    public function accepts_url_email_phone_shapes(): void
    {
        $this->assertTrue($this->validator->validate('https://github.com/jmitchell-dev', [
            'answer_shape' => 'url',
            'brevity' => 'minimal',
            'max_words' => 1,
        ])['passed']);

        $this->assertTrue($this->validator->validate('james.mitchell@example.com', [
            'answer_shape' => 'email',
            'brevity' => 'minimal',
            'max_words' => 1,
        ])['passed']);

        $this->assertTrue($this->validator->validate('+447700900123', [
            'answer_shape' => 'phone',
            'brevity' => 'minimal',
            'max_words' => 1,
        ])['passed']);
    }
}
