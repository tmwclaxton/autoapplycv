<?php

namespace App\Http\Requests;

use App\Enums\ProfileDocumentCategory;
use App\Support\UploadMimeRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;

class StoreProfileDocumentRequest extends FormRequest
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
            'file' => [
                'required',
                File::types(UploadMimeRules::documentUploadMimes())
                    ->max(UploadMimeRules::documentUploadMaxKilobytes()),
            ],
            'category' => ['required', Rule::enum(ProfileDocumentCategory::class)],
            'title' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'file.required' => 'Choose a file to upload.',
            'file.mimes' => UploadMimeRules::documentValidationMessage(),
            'file.extensions' => UploadMimeRules::documentValidationMessage(),
            'file.max' => 'The file must not be larger than '.(int) (UploadMimeRules::documentUploadMaxKilobytes() / 1024).'MB.',
        ];
    }
}
