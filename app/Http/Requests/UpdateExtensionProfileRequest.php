<?php

namespace App\Http\Requests;

use App\Support\ProfileFieldRegistry;
use Illuminate\Foundation\Http\FormRequest;

class UpdateExtensionProfileRequest extends FormRequest
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
        return ProfileFieldRegistry::extensionValidationRules();
    }
}
