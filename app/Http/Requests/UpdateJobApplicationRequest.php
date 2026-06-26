<?php

namespace App\Http\Requests;

use App\Enums\ApplicationStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateJobApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null
            && $this->route('jobApplication')?->user_id === $this->user()->id;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(ApplicationStatus::class)],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
}
