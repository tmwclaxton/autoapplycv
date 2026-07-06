<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AwardUserCreditsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $maxAward = (int) config('admin.credit_award_max_per_request', 50_000);

        return [
            'email' => ['required', 'email', 'max:255'],
            'amount' => ['required', 'integer', 'min:1', 'max:'.$maxAward],
            'note' => ['nullable', 'string', 'max:500'],
            'package_key' => [
                'nullable',
                'string',
                Rule::in(array_keys(config('admin.credit_packages', []))),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'amount.max' => 'A single award cannot exceed :max autofills.',
        ];
    }
}
