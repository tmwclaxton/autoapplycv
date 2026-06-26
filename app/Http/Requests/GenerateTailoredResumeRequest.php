<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GenerateTailoredResumeRequest extends FormRequest
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
            'job.description' => ['nullable', 'string', 'max:20000'],
            'job.link' => ['nullable', 'url', 'max:2048'],
            'template' => ['nullable', 'string', 'in:modern,consulting,harvard'],
            'application_id' => ['nullable', 'integer', 'exists:job_applications,id'],
        ];
    }
}
