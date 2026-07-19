<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class VetDraftAnswersRequest extends FormRequest
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
            'candidates' => ['required', 'array', 'min:1', 'max:20'],
            'candidates.*.ref' => ['nullable', 'string', 'max:32'],
            'candidates.*.label' => ['required', 'string', 'max:500'],
            'candidates.*.field_type' => ['nullable', 'string', 'max:32'],
            'candidates.*.options' => ['nullable', 'array', 'max:64'],
            'candidates.*.options.*' => ['string', 'max:255'],
            'candidates.*.answer' => ['nullable', 'string', 'max:5000'],
            'settings' => ['nullable', 'array'],
        ];
    }
}
