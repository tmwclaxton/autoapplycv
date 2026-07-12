<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class InventoryApplicationRequest extends FormRequest
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
            'job.title' => ['required', 'string', 'max:255'],
            'job.company' => ['required', 'string', 'max:255'],
            'job.link' => ['nullable', 'url', 'max:2048'],
            'job.description' => ['nullable', 'string', 'max:20000'],
            'job.job_description' => ['nullable', 'string', 'max:20000'],
            'page_title' => ['nullable', 'string', 'max:500'],
            'snapshot' => ['required', 'array'],
            'snapshot.page_url' => ['nullable', 'string', 'max:2048'],
            'snapshot.page_title' => ['nullable', 'string', 'max:500'],
            'snapshot.elements' => ['required', 'array', 'max:80'],
            'snapshot.elements.*.ref' => ['required', 'string', 'max:32'],
            'snapshot.elements.*.question' => ['required', 'string', 'max:500'],
            'snapshot.elements.*.field_type' => ['nullable', 'string', 'max:32'],
            'snapshot.elements.*.max_chars' => ['nullable', 'integer', 'min:20', 'max:5000'],
            'snapshot.elements.*.options' => ['nullable', 'array', 'max:64'],
            'snapshot.elements.*.options.*' => ['string', 'max:255'],
            'snapshot.elements.*.required' => ['nullable', 'boolean'],
            'snapshot.elements.*.context' => ['nullable', 'string', 'max:500'],
            'snapshot.controls' => ['nullable', 'array', 'max:20'],
            'snapshot.controls.*.ref' => ['required_with:snapshot.controls', 'string', 'max:32'],
            'snapshot.controls.*.name' => ['required_with:snapshot.controls', 'string', 'max:255'],
            'snapshot.controls.*.role' => ['nullable', 'string', 'max:32'],
            'settings' => ['nullable', 'array'],
        ];
    }
}
