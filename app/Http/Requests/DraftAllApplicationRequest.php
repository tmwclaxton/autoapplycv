<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DraftAllApplicationRequest extends FormRequest
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
            'page_title' => ['nullable', 'string', 'max:500'],
            'fields' => ['required', 'array', 'min:1', 'max:40'],
            'fields.*.id' => ['required', 'integer', 'min:0'],
            'fields.*.ref' => ['nullable', 'string', 'max:32'],
            'fields.*.label' => ['required', 'string', 'max:500'],
            'fields.*.field_type' => ['nullable', 'string', 'max:32'],
            'fields.*.max_chars' => ['nullable', 'integer', 'min:20', 'max:5000'],
            'fields.*.options' => ['nullable', 'array', 'max:30'],
            'fields.*.options.*' => ['string', 'max:255'],
            'settings' => ['nullable', 'array'],
        ];
    }
}
