<?php

namespace Tests\Unit\Extension;

use App\Models\CvProfile;
use App\Models\User;
use App\Support\ProfileIdentityFieldResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FixtureAnswerQualityAuditTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @var array<int, string>
     */
    private const AUDIT_SCENARIO_IDS = [
        'web-ashby-notion-bdm-f603aedb',
        'web-boards-greenhouse-io-8614025002',
        'web-jobs-lever-co-apply-11',
        'web-jobs-smartrecruiters-com-99cf550a-4a3b-47f8-b682-449cc524d98f',
        'web-dupont-wd5-myworkdayjobs-com-applymanually',
        'web-vekst-teamtailor-com-new-3',
        'web-vekst-teamtailor-com-new',
        'web-jobs-ashbyhq-com-application-9',
        'web-jobs-ashbyhq-com-application-16',
        'web-jobs-ashbyhq-com-application-3',
        'web-job-boards-greenhouse-io-5025215008',
        'web-jobs-lever-co-apply-5',
        'web-jobs-smartrecruiters-com-87584664-application-packager',
        'web-jobs-smartrecruiters-com-69e6be07-412d-4df2-8406-bac6c8c4b56b',
        'web-usgnorthamerica-teamtailor-com-jobs',
        'syn-corpus2-teamtailor-001',
        'web-boards-greenhouse-io-8571766002',
        'web-wpforms-com-employment-agency-application-form-template',
        'syn-fw-ashby-001',
        'web-jobs-ashbyhq-com-application',
    ];

    /**
     * @return array<string, mixed>
     */
    private function auditProfileAttributes(): array
    {
        return [
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
            'phone' => '+447837370669',
            'city' => 'High Wycombe',
            'location' => 'High Wycombe, Buckinghamshire',
            'summary' => 'Software engineer with Laravel and Vue experience.',
            'structured_data' => [
                'experience' => [
                    ['company' => 'Example Ltd', 'title' => 'Software Engineer'],
                ],
            ],
        ];
    }

    /**
     * @return array<int, array{label: string, ref: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null, dom?: array<string, mixed>|null}>
     */
    private function loadFixtureQuestions(string $scenarioId): array
    {
        $path = base_path("tests/fixtures/form-extraction/expected/{$scenarioId}.json");

        $this->assertFileExists($path, "Missing expected fixture for {$scenarioId}");

        $expected = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        $questions = [];

        foreach ($expected['fields'] ?? [] as $index => $field) {
            $fieldType = (string) ($field['field_type'] ?? 'text');

            if (in_array($fieldType, ['file', 'hidden'], true)) {
                continue;
            }

            $domId = $field['dom']['id'] ?? null;

            if (in_array($domId, ['analytics', 'marketing', 'strictly_necessary'], true)) {
                continue;
            }

            $questions[] = [
                'label' => (string) ($field['question'] ?? "field-{$index}"),
                'ref' => "f{$index}",
                'field_type' => $fieldType,
                'max_chars' => $field['max_chars'] ?? null,
                'options' => $field['options'] ?? null,
                'dom' => $field['dom'] ?? null,
            ];
        }

        return $questions;
    }

    /**
     * @param  array<int, array{label: string, ref: string, answer: string}>  $identityAnswers
     */
    private function assertIdentityAnswerMatchesProfile(
        CvProfile $profile,
        array $identityAnswers,
        string $path,
        string $ref,
    ): void {
        $answer = collect($identityAnswers)->firstWhere('ref', $ref)['answer'] ?? null;

        $this->assertNotNull($answer, "{$path}: missing identity answer for {$ref}");
        $this->assertNotSame('Erik', $answer);
        $this->assertStringNotContainsString('example.com', strtolower((string) $answer));
        $this->assertStringNotContainsString('andersson', strtolower((string) $answer));

        if ($path === 'full_name.first') {
            $this->assertSame('Toby', $answer);
        } elseif ($path === 'full_name.last') {
            $this->assertSame('Claxton', $answer);
        } elseif ($path === 'email') {
            $this->assertSame('tmwclaxton@gmail.com', $answer);
        } elseif ($path === 'phone') {
            $this->assertStringContainsString('7837370669', preg_replace('/\s+/', '', (string) $answer) ?? '');
        } elseif ($path === 'city') {
            $this->assertSame('High Wycombe', $answer);
        }
    }

    public function test_audit_scenarios_resolve_identity_without_hallucination(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create($this->auditProfileAttributes());
        $settings = ['phone_country_code' => '+44'];

        foreach (self::AUDIT_SCENARIO_IDS as $scenarioId) {
            $questions = $this->loadFixtureQuestions($scenarioId);
            $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, $questions, $settings);

            foreach ($questions as $question) {
                $mapping = ProfileIdentityFieldResolver::resolveMappingForQuestion($question);

                if ($mapping === null || ! ProfileIdentityFieldResolver::isIdentityPath($mapping['path'])) {
                    continue;
                }

                $this->assertIdentityAnswerMatchesProfile(
                    $profile,
                    $partition['identity_answers'],
                    $mapping['path'],
                    $question['ref'],
                );
            }
        }
    }

    public function test_teamtailor_vekst_swedish_labels_stay_out_of_llm_batch_for_identity(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create($this->auditProfileAttributes());

        $questions = $this->loadFixtureQuestions('web-vekst-teamtailor-com-new-3');
        $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, $questions, ['phone_country_code' => '+44']);

        $identityRefs = collect($partition['identity_answers'])->pluck('ref')->all();
        $llmLabels = collect($partition['llm_questions'])->pluck('label')->all();

        $this->assertContains('f7', $identityRefs);
        $this->assertContains('f8', $identityRefs);
        $this->assertContains('f9', $identityRefs);

        $swedishMotivation = collect($llmLabels)->first(
            fn (string $label) => str_contains(mb_strtolower($label), 'varför du fastnade'),
        );
        $this->assertNotNull($swedishMotivation);
        $this->assertNotContains('f7', collect($partition['llm_questions'])->pluck('ref')->all());
    }

    public function test_option_fields_in_audit_fixtures_have_valid_first_option_mock(): void
    {
        foreach (self::AUDIT_SCENARIO_IDS as $scenarioId) {
            $questions = $this->loadFixtureQuestions($scenarioId);

            foreach ($questions as $question) {
                $fieldType = $question['field_type'];
                $options = $question['options'] ?? null;

                if (! in_array($fieldType, ['select', 'radio', 'checkbox'], true)) {
                    continue;
                }

                if (! is_array($options) || $options === []) {
                    continue;
                }

                $mockAnswer = $options[0];
                $this->assertContains(
                    $mockAnswer,
                    $options,
                    "{$scenarioId}: mock option {$mockAnswer} must exist on page",
                );
            }
        }
    }
}
