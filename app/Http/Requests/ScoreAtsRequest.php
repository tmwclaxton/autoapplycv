<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ScoreAtsRequest extends FormRequest
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
            'job_description' => ['required', 'string', 'max:20000'],
            'application_id' => ['nullable', 'integer', 'exists:job_applications,id'],
        ];
    }
}
