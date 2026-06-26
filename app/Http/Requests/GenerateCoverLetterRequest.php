<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GenerateCoverLetterRequest extends FormRequest
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
            'job.title' => ['nullable', 'string', 'max:255'],
            'job.company' => ['nullable', 'string', 'max:255'],
            'job.description' => ['required', 'string', 'min:40', 'max:20000'],
            'job.link' => ['nullable', 'url', 'max:2048'],
            'tone' => ['nullable', 'string', 'max:32'],
        ];
    }
}
