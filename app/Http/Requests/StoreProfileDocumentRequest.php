<?php

namespace App\Http\Requests;

use App\Enums\ProfileDocumentCategory;
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
                File::types(config('cv.document_allowed_mimes', ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp']))
                    ->max(config('cv.document_max_upload_kb', 10240)),
            ],
            'category' => ['required', Rule::enum(ProfileDocumentCategory::class)],
            'title' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
