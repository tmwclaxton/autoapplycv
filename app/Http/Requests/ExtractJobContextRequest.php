<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExtractJobContextRequest extends FormRequest
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
            'page_title' => ['nullable', 'string', 'max:500'],
            'page_url' => ['nullable', 'string', 'max:2048'],
            'page_text' => ['nullable', 'string', 'max:20000'],
        ];
    }
}
