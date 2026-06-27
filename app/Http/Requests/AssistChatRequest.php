<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AssistChatRequest extends FormRequest
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
            'messages' => ['required', 'array', 'min:1', 'max:20'],
            'messages.*.role' => ['required', 'in:user,assistant'],
            'messages.*.content' => ['required', 'string', 'max:4000'],
            'job' => ['nullable', 'array'],
            'job.title' => ['nullable', 'string', 'max:255'],
            'job.company' => ['nullable', 'string', 'max:255'],
            'job.description' => ['nullable', 'string', 'max:20000'],
            'focused_field' => ['nullable', 'array'],
            'focused_field.label' => ['nullable', 'string', 'max:500'],
            'focused_field.field_type' => ['nullable', 'string', 'max:50'],
        ];
    }
}
