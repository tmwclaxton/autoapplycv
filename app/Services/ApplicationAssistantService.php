<?php

namespace App\Services;

use App\Enums\ApplicationArtifactType;
use App\Models\ApplicationArtifact;
use App\Models\CvProfile;
use App\Models\JobApplication;

class ApplicationAssistantService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{label: string, field_type?: string, max_chars?: int, options?: array<int, string>}>  $questions
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @return array<int, array{label: string, answer: string|null}>|null
     */
    public function answerQuestions(CvProfile $profile, array $job, array $questions, array $settings = []): ?array
    {
        if ($questions === []) {
            return [];
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile, $settings),
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => $job,
                    'questions' => $questions,
                    'instructions' => 'Return JSON: {"answers":[{"label":"exact label from input","answer":"string or null"}]}. Use null when unsure. Never invent employers, degrees, or dates. For yes/no radio questions return exactly "yes" or "no". Keep within max_chars when provided.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.4,
        ]);

        if ($payload === null || ! isset($payload['answers']) || ! is_array($payload['answers'])) {
            return null;
        }

        $answers = [];

        foreach ($payload['answers'] as $row) {
            if (! is_array($row) || ! isset($row['label'])) {
                continue;
            }

            $answers[] = [
                'label' => (string) $row['label'],
                'answer' => isset($row['answer']) && is_string($row['answer']) && trim($row['answer']) !== ''
                    ? trim($row['answer'])
                    : null,
            ];
        }

        return $answers;
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function generateCoverLetter(CvProfile $profile, array $job, string $tone = 'professional'): ?string
    {
        $result = $this->nanoGpt->chat([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile)."\n\nWrite concise, truthful cover letters. Do not invent experience.",
            ],
            [
                'role' => 'user',
                'content' => "Write a {$tone} cover letter for this job. 180-280 words. Plain text only.\n\n"
                    .json_encode($job, JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.5,
        ]);

        return $result !== null && trim($result) !== '' ? trim($result) : null;
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function generateTailoredResume(CvProfile $profile, array $job, string $template = 'modern'): ?string
    {
        $templateGuide = match ($template) {
            'consulting' => 'Use a concise consulting-style layout: strong action bullets, quantified impact, leadership verbs, one-line role summaries.',
            'harvard' => 'Use a classic Harvard-style CV: reverse chronological roles, education block, skills line, restrained tone, no graphics.',
            default => 'Use a modern professional layout: headline, summary, skills, experience bullets tailored to the job.',
        };

        $result = $this->nanoGpt->chat([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile)."\n\nTailor the CV truthfully to the job. Do not invent employers, dates, or qualifications. {$templateGuide} Output plain text only.",
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => $job,
                    'template' => $template,
                    'instructions' => 'Return a complete tailored CV in plain text, 500-900 words, with sections: Name, Headline, Summary, Skills, Experience, Education. Emphasise keywords from the job description using only real profile facts.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.45,
        ]);

        return $result !== null && trim($result) !== '' ? trim($result) : null;
    }

    /**
     * @return array{
     *     score: int,
     *     matched_keywords: array<int, string>,
     *     missing_keywords: array<int, string>,
     *     suggestions: array<int, string>
     * }|null
     */
    public function scoreAts(CvProfile $profile, ?string $jobDescription): ?array
    {
        $cvText = trim((string) ($profile->formatted_cv_text ?: $profile->summary));

        if ($cvText === '' || $jobDescription === null || trim($jobDescription) === '') {
            return null;
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'You score CV keyword fit against a job description for ATS-style screening. Be realistic, not flattering.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'cv_text' => mb_substr($cvText, 0, 12000),
                    'job_description' => mb_substr(trim($jobDescription), 0, 12000),
                    'response_schema' => [
                        'score' => 'integer 0-100',
                        'matched_keywords' => 'string[]',
                        'missing_keywords' => 'string[]',
                        'suggestions' => 'string[]',
                    ],
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.2,
        ]);

        if ($payload === null) {
            return null;
        }

        return [
            'score' => max(0, min(100, (int) ($payload['score'] ?? 0))),
            'matched_keywords' => array_values(array_filter($payload['matched_keywords'] ?? [], 'is_string')),
            'missing_keywords' => array_values(array_filter($payload['missing_keywords'] ?? [], 'is_string')),
            'suggestions' => array_values(array_filter($payload['suggestions'] ?? [], 'is_string')),
        ];
    }

    public function storeArtifact(
        JobApplication $application,
        ApplicationArtifactType $type,
        string $title,
        string $content,
        ?array $metadata = null,
    ): ApplicationArtifact {
        return $application->artifacts()->create([
            'type' => $type,
            'title' => $title,
            'content' => $content,
            'metadata' => $metadata,
        ]);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private function systemPrompt(CvProfile $profile, array $settings = []): string
    {
        $structured = json_encode([
            'full_name' => $profile->full_name,
            'headline' => $profile->headline,
            'summary' => $profile->summary,
            'skills' => $profile->skills,
            'experience' => $profile->experience,
            'education' => $profile->education,
            'structured_data' => $profile->structured_data,
            'extra_context' => $profile->extra_context,
            'application_settings' => $settings,
        ], JSON_THROW_ON_ERROR);

        return "You help a job seeker answer employer application questions using ONLY this profile:\n{$structured}";
    }
}
