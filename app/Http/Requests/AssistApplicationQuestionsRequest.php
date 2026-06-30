<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AssistApplicationQuestionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'job' => ['required', 'array'],
            'job.title' => ['required', 'string', 'max:255'],
            'job.company' => ['required', 'string', 'max:255'],
            'job.link' => ['nullable', 'url', 'max:2048'],
            'job.description' => ['nullable', 'string', 'max:20000'],
            'questions' => ['required', 'array', 'min:1', 'max:10'],
            'questions.*.label' => ['required', 'string', 'max:500'],
            'questions.*.ref' => ['nullable', 'string', 'max:32'],
            'questions.*.field_type' => ['nullable', 'string', 'max:32'],
            'questions.*.max_chars' => ['nullable', 'integer', 'min:20', 'max:5000'],
            'questions.*.options' => ['nullable', 'array', 'max:20'],
            'questions.*.options.*' => ['string', 'max:255'],
            'settings' => ['nullable', 'array'],
        ];
    }
}
