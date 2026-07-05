<?php

namespace App\Support;

use Illuminate\Support\Str;

class ApplicationAnswers
{
    /**
     * @param  array<int, mixed>|null  $answers
     * @return array<int, array{id: string, question: string, answer: string}>
     */
    public static function normalize(?array $answers): array
    {
        if (! is_array($answers)) {
            return [];
        }

        $normalized = [];

        foreach ($answers as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $question = trim((string) ($entry['question'] ?? ''));
            $answer = trim((string) ($entry['answer'] ?? ''));

            if ($question === '' || $answer === '') {
                continue;
            }

            $id = trim((string) ($entry['id'] ?? ''));

            if ($id === '') {
                $id = (string) Str::uuid();
            }

            $normalized[] = [
                'id' => $id,
                'question' => $question,
                'answer' => $answer,
            ];
        }

        return $normalized;
    }

    /**
     * @param  array<int, array{id: string, question: string, answer: string}>  $existing
     * @return array<int, array{id: string, question: string, answer: string}>
     */
    public static function upsert(array $existing, string $question, string $answer): array
    {
        $question = trim($question);
        $answer = trim($answer);

        if ($question === '' || $answer === '') {
            return $existing;
        }

        $key = self::normalizeQuestionKey($question);

        foreach ($existing as $index => $entry) {
            if (self::normalizeQuestionKey($entry['question']) !== $key) {
                continue;
            }

            $existing[$index]['answer'] = $answer;

            return array_values($existing);
        }

        $existing[] = [
            'id' => (string) Str::uuid(),
            'question' => $question,
            'answer' => $answer,
        ];

        return array_values($existing);
    }

    /**
     * @param  array<int, array{id: string, question: string, answer: string}>  $existing
     * @return array<int, array{id: string, question: string, answer: string}>
     */
    public static function removeById(array $existing, string $id): array
    {
        $id = trim($id);

        if ($id === '') {
            return $existing;
        }

        return array_values(array_filter(
            $existing,
            static fn (array $entry): bool => ($entry['id'] ?? '') !== $id,
        ));
    }

    /**
     * @param  array<int, array{id: string, question: string, answer: string}>  $answers
     * @return array<string, string>
     */
    public static function questionAnswerMap(array $answers): array
    {
        $map = [];

        foreach ($answers as $entry) {
            $question = trim((string) ($entry['question'] ?? ''));
            $answer = trim((string) ($entry['answer'] ?? ''));

            if ($question === '' || $answer === '') {
                continue;
            }

            $map[$question] = $answer;
        }

        return $map;
    }

    public static function normalizeQuestionKey(string $question): string
    {
        $normalized = strtolower(trim($question));
        $normalized = preg_replace('/\s+required(?:\s+required)*$/', '', $normalized) ?? $normalized;
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;

        return trim($normalized);
    }

    /**
     * @return array<string, mixed>
     */
    public static function validationRules(): array
    {
        return [
            'application_answers' => ['sometimes', 'nullable', 'array'],
            'application_answers.*.id' => ['sometimes', 'nullable', 'uuid'],
            'application_answers.*.question' => ['required_with:application_answers.*.answer', 'string', 'max:500'],
            'application_answers.*.answer' => ['required_with:application_answers.*.question', 'string', 'max:5000'],
            'application_answers_append' => ['sometimes', 'array'],
            'application_answers_append.question' => ['required_with:application_answers_append.answer', 'string', 'max:500'],
            'application_answers_append.answer' => ['required_with:application_answers_append.question', 'string', 'max:5000'],
            'application_answers_remove_id' => ['sometimes', 'uuid'],
        ];
    }
}
