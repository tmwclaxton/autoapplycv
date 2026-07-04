<?php

namespace App\Http\Requests;

use App\Support\UploadMimeRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\File;

class StoreCvUploadRequest extends FormRequest
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
            'cv' => [
                'required',
                File::types(UploadMimeRules::cvUploadMimes())
                    ->max(UploadMimeRules::cvUploadMaxKilobytes()),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'cv.required' => 'Choose a CV file to upload.',
            'cv.mimes' => UploadMimeRules::cvValidationMessage(),
            'cv.extensions' => UploadMimeRules::cvValidationMessage(),
            'cv.max' => 'The CV file must not be larger than '.(int) (UploadMimeRules::cvUploadMaxKilobytes() / 1024).'MB.',
        ];
    }
}
