<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DraftFieldRequest extends FormRequest
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
            'job.job_description' => ['nullable', 'string', 'max:20000'],
            'field' => ['required', 'array'],
            'field.label' => ['required', 'string', 'max:500'],
            'field.field_type' => ['nullable', 'string', 'max:32'],
            'field.max_chars' => ['nullable', 'integer', 'min:20', 'max:5000'],
            'field.options' => ['nullable', 'array', 'max:30'],
            'field.options.*' => ['string', 'max:255'],
            'settings' => ['nullable', 'array'],
        ];
    }
}
