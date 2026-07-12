<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreCoverLetterDocumentRequest extends FormRequest
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
            'job.link' => ['nullable', 'string', 'max:2048'],
            'text' => ['nullable', 'string', 'min:40', 'max:20000'],
            'file_base64' => ['nullable', 'string', 'max:5000000'],
            'file_name' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $text = trim((string) $this->input('text', ''));
            $fileBase64 = trim((string) $this->input('file_base64', ''));

            if ($text === '' && $fileBase64 === '') {
                $validator->errors()->add('text', 'Provide cover letter text or a PDF file.');
            }
        });
    }
}
