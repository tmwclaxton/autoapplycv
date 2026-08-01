<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ScoreAtsCheckerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'cv_text' => ['required', 'string', 'min:40', 'max:20000'],
            'job_description' => ['required', 'string', 'min:40', 'max:20000'],
            'role_preferences' => ['nullable', 'string', 'max:500'],
        ];
    }
}
