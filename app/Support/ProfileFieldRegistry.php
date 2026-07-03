<?php

namespace App\Support;

use Illuminate\Support\Arr;

class ProfileFieldRegistry
{
    /**
     * @return array<string, array{
     *     label: string,
     *     tab: string,
     *     anchor: string,
     *     path: string,
     *     kind: 'string'|'array'|'settings',
     *     direct_keywords?: array<int, string>,
     * }>
     */
    public static function definitions(): array
    {
        return [
            'full_name' => self::field('Full name', 'profile', 'field-full-name', 'full_name', 'string', ['full name', 'name']),
            'headline' => self::field('Headline', 'profile', 'field-headline', 'headline', 'string', ['headline', 'title']),
            'email' => self::field('Email', 'profile', 'field-email', 'email', 'string', ['email']),
            'phone' => self::field('Phone', 'profile', 'field-phone', 'phone', 'string', ['phone', 'mobile', 'telephone']),
            'location' => self::field('Location', 'profile', 'field-location', 'location', 'string', ['location']),
            'city' => self::field('City', 'profile', 'field-city', 'city', 'string', ['city', 'town']),
            'postcode' => self::field('Postcode', 'profile', 'field-postcode', 'postcode', 'string', ['postcode', 'post code', 'zip code', 'zip']),
            'country' => self::field('Country', 'profile', 'field-country', 'country', 'string', ['country']),
            'linkedin_url' => self::field('LinkedIn', 'profile', 'field-linkedin-url', 'linkedin_url', 'string', ['linkedin']),
            'website_url' => self::field('Website', 'profile', 'field-website-url', 'website_url', 'string', ['website']),
            'summary' => self::field('Professional summary', 'profile', 'field-summary', 'summary', 'string', ['summary', 'professional summary', 'bio']),
            'extra_context' => self::field('Extra context', 'profile', 'field-extra-context', 'extra_context', 'string', ['extra context', 'context']),
            'formatted_cv_text' => self::field('Formatted CV text', 'profile', 'field-formatted-cv', 'formatted_cv_text', 'string', ['formatted cv', 'cv text']),
            'skills' => self::field('Skills', 'profile', 'field-skills', 'skills', 'array', ['skills', 'skill list']),
            'experience' => self::field('Experience', 'experience', 'field-experience', 'experience', 'array', ['experience', 'work history', 'employment history']),
            'education' => self::field('Education', 'experience', 'field-education', 'education', 'array', ['education', 'qualifications']),
            'structured_data.address_line_1' => self::field('Address line 1', 'profile', 'field-address-line-1', 'structured_data.address_line_1', 'string', ['address line 1', 'address line', 'street address', 'street', 'address']),
            'structured_data.address_line_2' => self::field('Address line 2', 'profile', 'field-address-line-2', 'structured_data.address_line_2', 'string', ['address line 2']),
            'structured_data.state_region' => self::field('State / region', 'profile', 'field-state-region', 'structured_data.state_region', 'string', ['state/region', 'state region', 'state', 'region', 'county']),
            'structured_data.social_links' => self::field('Social links', 'profile', 'field-social-links', 'structured_data.social_links', 'array'),
            'structured_data.languages' => self::field('Languages', 'profile', 'field-languages', 'structured_data.languages', 'array', ['languages', 'language']),
            'structured_data.certifications' => self::field('Certifications', 'profile', 'field-certifications', 'structured_data.certifications', 'array', ['certifications', 'certification']),
            'structured_data.projects' => self::field('Projects', 'profile', 'field-projects', 'structured_data.projects', 'array', ['projects', 'project']),
            'structured_data.publications' => self::field('Publications', 'profile', 'field-publications', 'structured_data.publications', 'array', ['publications', 'publication']),
            'structured_data.awards' => self::field('Awards', 'profile', 'field-awards', 'structured_data.awards', 'array', ['awards', 'award']),
            'structured_data.volunteering' => self::field('Volunteering', 'profile', 'field-volunteering', 'structured_data.volunteering', 'array', ['volunteering', 'volunteer']),
            'structured_data.memberships' => self::field('Memberships', 'profile', 'field-memberships', 'structured_data.memberships', 'array', ['memberships', 'membership']),
            'structured_data.references' => self::field('References', 'profile', 'field-references', 'structured_data.references', 'array', ['references', 'reference']),
            'structured_data.interests' => self::field('Interests', 'profile', 'field-interests', 'structured_data.interests', 'array', ['interests', 'interest']),
            'structured_data.technical_skills' => self::field('Technical skills', 'profile', 'field-technical-skills', 'structured_data.technical_skills', 'array', ['technical skills']),
            'structured_data.soft_skills' => self::field('Soft skills', 'profile', 'field-soft-skills', 'structured_data.soft_skills', 'array', ['soft skills']),
            'structured_data.additional_sections' => self::field('Additional sections', 'profile', 'field-additional-sections', 'structured_data.additional_sections', 'array', ['additional sections']),
            'application_settings.phone_country_code' => self::field('Phone country code', 'preferences', 'field-phone-country-code', 'application_settings.phone_country_code', 'settings', ['phone country code', 'country code']),
            'application_settings.years_of_experience' => self::field('Years of experience', 'preferences', 'field-years-of-experience', 'application_settings.years_of_experience', 'settings', ['years of experience', 'experience years']),
            'application_settings.expected_salary' => self::field('Expected salary', 'preferences', 'field-expected-salary', 'application_settings.expected_salary', 'settings', ['expected salary', 'salary expectation', 'salary']),
            'application_settings.visa_sponsorship' => self::field('Visa sponsorship', 'preferences', 'field-visa-sponsorship', 'application_settings.visa_sponsorship', 'settings', ['visa sponsorship', 'visa']),
            'application_settings.legally_authorized' => self::field('Legally authorized to work', 'preferences', 'field-legally-authorized', 'application_settings.legally_authorized', 'settings', ['legally authorized', 'work authorization', 'right to work']),
            'application_settings.willing_to_relocate' => self::field('Willing to relocate', 'preferences', 'field-willing-to-relocate', 'application_settings.willing_to_relocate', 'settings', ['willing to relocate', 'relocate']),
            'application_settings.drivers_license' => self::field('Driving licence', 'preferences', 'field-drivers-license', 'application_settings.drivers_license', 'settings', ['drivers license', 'driving licence', 'driving license']),
            'application_settings.job_preferences' => self::field('Job preferences', 'preferences', 'field-job-preferences', 'application_settings.job_preferences', 'settings', ['job preferences', 'job preference']),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function extensionValidationRules(): array
    {
        return [
            'full_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'headline' => ['sometimes', 'nullable', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:255'],
            'postcode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'country' => ['sometimes', 'nullable', 'string', 'max:255'],
            'linkedin_url' => ['sometimes', 'nullable', 'url', 'max:500'],
            'website_url' => ['sometimes', 'nullable', 'url', 'max:500'],
            'summary' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'extra_context' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'formatted_cv_text' => ['sometimes', 'nullable', 'string'],
            'skills' => ['sometimes', 'nullable', 'array'],
            'skills.*' => ['string', 'max:255'],
            'experience' => ['sometimes', 'nullable', 'array'],
            'education' => ['sometimes', 'nullable', 'array'],
            'structured_data' => ['sometimes', 'array'],
            'structured_data.address_line_1' => ['sometimes', 'nullable', 'string', 'max:255'],
            'structured_data.address_line_2' => ['sometimes', 'nullable', 'string', 'max:255'],
            'structured_data.state_region' => ['sometimes', 'nullable', 'string', 'max:255'],
            'structured_data.social_links' => ['sometimes', 'nullable', 'array'],
            'structured_data.languages' => ['sometimes', 'nullable', 'array'],
            'structured_data.certifications' => ['sometimes', 'nullable', 'array'],
            'structured_data.projects' => ['sometimes', 'nullable', 'array'],
            'structured_data.publications' => ['sometimes', 'nullable', 'array'],
            'structured_data.awards' => ['sometimes', 'nullable', 'array'],
            'structured_data.volunteering' => ['sometimes', 'nullable', 'array'],
            'structured_data.memberships' => ['sometimes', 'nullable', 'array'],
            'structured_data.references' => ['sometimes', 'nullable', 'array'],
            'structured_data.interests' => ['sometimes', 'nullable', 'array'],
            'structured_data.interests.*' => ['string', 'max:255'],
            'structured_data.technical_skills' => ['sometimes', 'nullable', 'array'],
            'structured_data.soft_skills' => ['sometimes', 'nullable', 'array'],
            'structured_data.soft_skills.*' => ['string', 'max:255'],
            'structured_data.additional_sections' => ['sometimes', 'nullable', 'array'],
            ...ApplicationSettings::validationRules(),
        ];
    }

    /**
     * @return array{label: string, tab: string, anchor: string, path: string, kind: 'string'|'array'|'settings', direct_keywords?: array<int, string>}|null
     */
    public static function metadata(string $field): ?array
    {
        $resolved = self::resolveField($field);

        if ($resolved === null) {
            return null;
        }

        return self::definitions()[$resolved];
    }

    public static function resolveField(string $field): ?string
    {
        $normalized = strtolower(trim(str_replace([' ', '-'], '_', $field)));

        $aliases = [
            'name' => 'full_name',
            'linkedin' => 'linkedin_url',
            'website' => 'website_url',
            'professional_summary' => 'summary',
            'bio' => 'summary',
            'address' => 'structured_data.address_line_1',
            'address_line_1' => 'structured_data.address_line_1',
            'address_line1' => 'structured_data.address_line_1',
            'street' => 'structured_data.address_line_1',
            'address_line_2' => 'structured_data.address_line_2',
            'address_line2' => 'structured_data.address_line_2',
            'state' => 'structured_data.state_region',
            'region' => 'structured_data.state_region',
            'county' => 'structured_data.state_region',
            'state_region' => 'structured_data.state_region',
            'social_links' => 'structured_data.social_links',
            'languages' => 'structured_data.languages',
            'certifications' => 'structured_data.certifications',
            'projects' => 'structured_data.projects',
            'publications' => 'structured_data.publications',
            'awards' => 'structured_data.awards',
            'volunteering' => 'structured_data.volunteering',
            'memberships' => 'structured_data.memberships',
            'references' => 'structured_data.references',
            'interests' => 'structured_data.interests',
            'technical_skills' => 'structured_data.technical_skills',
            'soft_skills' => 'structured_data.soft_skills',
            'additional_sections' => 'structured_data.additional_sections',
            'phone_country_code' => 'application_settings.phone_country_code',
            'years_of_experience' => 'application_settings.years_of_experience',
            'expected_salary' => 'application_settings.expected_salary',
            'visa_sponsorship' => 'application_settings.visa_sponsorship',
            'visa' => 'application_settings.visa_sponsorship',
            'legally_authorized' => 'application_settings.legally_authorized',
            'willing_to_relocate' => 'application_settings.willing_to_relocate',
            'drivers_license' => 'application_settings.drivers_license',
            'driving_licence' => 'application_settings.drivers_license',
            'job_preferences' => 'application_settings.job_preferences',
        ];

        if (array_key_exists($normalized, $aliases)) {
            return $aliases[$normalized];
        }

        if (array_key_exists($field, self::definitions())) {
            return $field;
        }

        if (array_key_exists($normalized, self::definitions())) {
            return $normalized;
        }

        $dotPath = str_replace('_', '.', $normalized);

        return array_key_exists($dotPath, self::definitions()) ? $dotPath : null;
    }

    public static function promptFieldIds(): string
    {
        return implode('|', array_keys(self::definitions()));
    }

    /**
     * @return array<string, mixed>
     */
    public static function buildPatchPayload(string $field, mixed $value): array
    {
        $metadata = self::metadata($field);

        if ($metadata === null) {
            return [];
        }

        $payload = [];
        Arr::set($payload, $metadata['path'], $value);

        return $payload;
    }

    public static function shouldPolishWrittenValue(string $field): bool
    {
        return in_array(self::resolveField($field) ?? $field, [
            'full_name',
            'headline',
            'city',
            'location',
            'country',
            'postcode',
            'structured_data.address_line_1',
            'structured_data.address_line_2',
            'structured_data.state_region',
        ], true);
    }

    public static function shouldReviewSpelling(string $field): bool
    {
        return in_array(self::resolveField($field) ?? $field, [
            'full_name',
            'headline',
            'city',
            'location',
            'country',
            'structured_data.address_line_1',
            'structured_data.address_line_2',
            'structured_data.state_region',
        ], true);
    }

    /**
     * @return array<int, array{field: string, label: string, tab: string, anchor: string, path: string, keywords: array<int, string>}>
     */
    public static function directParseFields(): array
    {
        $fields = [];

        foreach (self::definitions() as $field => $definition) {
            if (! isset($definition['direct_keywords'])) {
                continue;
            }

            $fields[] = [
                'field' => $field,
                'label' => $definition['label'],
                'tab' => $definition['tab'],
                'anchor' => $definition['anchor'],
                'path' => $definition['path'],
                'keywords' => $definition['direct_keywords'],
            ];
        }

        return $fields;
    }

    /**
     * @param  array<int, string>|null  $keywords
     * @return array{
     *     label: string,
     *     tab: string,
     *     anchor: string,
     *     path: string,
     *     kind: 'string'|'array'|'settings',
     *     direct_keywords?: array<int, string>,
     * }
     */
    private static function field(
        string $label,
        string $tab,
        string $anchor,
        string $path,
        string $kind,
        ?array $keywords = null,
    ): array {
        $definition = [
            'label' => $label,
            'tab' => $tab,
            'anchor' => $anchor,
            'path' => $path,
            'kind' => $kind,
        ];

        if ($keywords !== null) {
            $definition['direct_keywords'] = $keywords;
        }

        return $definition;
    }
}
