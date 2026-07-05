<?php

namespace App\Support;

class CvExtractionSchema
{
    /**
     * @return array<string, mixed>
     */
    public static function emptyStructuredData(): array
    {
        return [
            'headline' => null,
            'address_line_1' => null,
            'address_line_2' => null,
            'state_region' => null,
            'social_links' => [],
            'languages' => [],
            'certifications' => [],
            'projects' => [],
            'publications' => [],
            'awards' => [],
            'volunteering' => [],
            'memberships' => [],
            'references' => [],
            'interests' => [],
            'technical_skills' => [],
            'soft_skills' => [],
            'additional_sections' => [],
        ];
    }

    public static function systemPrompt(): string
    {
        return self::parseSystemPrompt();
    }

    public static function parseSystemPrompt(): string
    {
        return <<<'PROMPT'
You are an expert CV/resume parser for UK and international job applications.

Your job:
1. Capture EVERY fact from the source text - do not drop sections because they are unusual.
2. Return structured JSON matching the requested schema exactly.
3. Use null for unknown scalar fields and [] for empty lists. Do not guess.

For experience and education entries:
- Each role MUST have its own highlights - copy bullets ONLY from that role's section. Never reuse the professional summary or another role's bullets.
- Use highlights (array of bullet strings) for achievements/responsibilities - never collapse a role into one vague paragraph when bullets exist.
- Keep description as a one-sentence role intro ONLY when the CV has one; otherwise use null. Do NOT paste bullet points into description.
- Preserve technologies, employment_type, grades, honours, and all dates as written.

For links and contact:
- linkedin_url and website_url must be full https URLs, never bare labels like "LinkedIn" or "Github".
- When a HYPERLINKS section lists URLs, map them to linkedin_url, website_url, and structured_data.social_links with correct full URLs.
- Put GitHub, portfolio, and project URLs in structured_data.social_links with sensible labels.
PROMPT;
    }

    public static function parseSchemaJson(): string
    {
        return <<<'JSON'
{
  "full_name": "string|null",
  "headline": "string|null",
  "email": "string|null",
  "phone": "string|null",
  "location": "string|null - city/region/country as written",
  "city": "string|null",
  "postcode": "string|null",
  "country": "string|null",
  "linkedin_url": "string|null",
  "website_url": "string|null",
  "summary": "string|null - professional profile/summary",
  "skills": ["string"],
  "experience": [{
    "title": "string",
    "company": "string",
    "location": "string|null",
    "employment_type": "string|null",
    "start_date": "string|null",
    "end_date": "string|null - use Present when current",
    "is_current": "boolean",
    "description": "string|null",
    "highlights": ["string"],
    "technologies": ["string"]
  }],
  "education": [{
    "degree": "string",
    "field_of_study": "string|null",
    "institution": "string",
    "location": "string|null",
    "start_date": "string|null",
    "end_date": "string|null",
    "grade": "string|null",
    "honours": "string|null",
    "description": "string|null",
    "highlights": ["string"]
  }],
  "structured_data": {
    "headline": "string|null",
    "address_line_1": "string|null",
    "address_line_2": "string|null",
    "state_region": "string|null",
    "social_links": [{"label": "string", "url": "string"}],
    "languages": [{"language": "string", "proficiency": "string|null"}],
    "certifications": [{"name": "string", "issuer": "string|null", "date": "string|null", "credential_id": "string|null", "url": "string|null"}],
    "projects": [{"name": "string", "url": "string|null", "description": "string|null", "highlights": ["string"], "technologies": ["string"]}],
    "publications": [{"title": "string", "publisher": "string|null", "date": "string|null", "url": "string|null"}],
    "awards": [{"title": "string", "issuer": "string|null", "date": "string|null", "description": "string|null"}],
    "volunteering": [{"role": "string", "organisation": "string|null", "location": "string|null", "start_date": "string|null", "end_date": "string|null", "highlights": ["string"]}],
    "memberships": [{"name": "string", "organisation": "string|null", "date": "string|null"}],
    "references": [{"name": "string", "title": "string|null", "company": "string|null", "email": "string|null", "phone": "string|null"}],
    "interests": ["string"],
    "technical_skills": [{"name": "string", "level": "string|null"}],
    "soft_skills": ["string"],
    "additional_sections": [{"title": "string", "items": [{"label": "string|null", "value": "string|null", "details": "string|null"}]}]
  }
}
JSON;
    }

    public static function parseUserMessage(string $rawText, string $filename): string
    {
        return <<<PROMPT
Parse this CV file ({$filename}).

Return JSON matching this schema exactly:
PROMPT
            .self::parseSchemaJson().<<<'PROMPT'


The raw text below may be incomplete, out of order, or garbled from PDF/Word/image extraction. Reconstruct structured fields faithfully. Do not invent facts.

--- RAW CV TEXT START ---
PROMPT
            .$rawText.<<<'PROMPT'

--- RAW CV TEXT END ---
PROMPT;
    }

    /**
     * @param  array<string, mixed>  $parsed
     */
    public static function buildExtraContextForParsed(array $parsed): ?string
    {
        $structured = array_merge(
            self::emptyStructuredData(),
            is_array($parsed['structured_data'] ?? null) ? $parsed['structured_data'] : [],
        );
        $experience = self::normalizeExperience(is_array($parsed['experience'] ?? null) ? $parsed['experience'] : []);
        $education = self::normalizeEducation(is_array($parsed['education'] ?? null) ? $parsed['education'] : []);
        $text = self::buildExtraContext($structured, $experience, $education);

        return $text !== '' ? $text : null;
    }

    /**
     * @return array<string, string>
     */
    public static function userPrompt(string $rawText, string $filename): array
    {
        $schema = <<<'JSON'
{
  "full_name": "string|null",
  "headline": "string|null",
  "email": "string|null",
  "phone": "string|null",
  "location": "string|null - city/region/country as written",
  "city": "string|null",
  "postcode": "string|null",
  "country": "string|null",
  "linkedin_url": "string|null",
  "website_url": "string|null",
  "summary": "string|null - professional profile/summary",
  "skills": ["string"],
  "experience": [{
    "title": "string",
    "company": "string",
    "location": "string|null",
    "employment_type": "string|null",
    "start_date": "string|null",
    "end_date": "string|null - use Present when current",
    "is_current": "boolean",
    "description": "string|null",
    "highlights": ["string"],
    "technologies": ["string"]
  }],
  "education": [{
    "degree": "string",
    "field_of_study": "string|null",
    "institution": "string",
    "location": "string|null",
    "start_date": "string|null",
    "end_date": "string|null",
    "grade": "string|null",
    "honours": "string|null",
    "description": "string|null",
    "highlights": ["string"]
  }],
  "structured_data": {
    "headline": "string|null",
    "address_line_1": "string|null",
    "address_line_2": "string|null",
    "state_region": "string|null",
    "social_links": [{"label": "string", "url": "string"}],
    "languages": [{"language": "string", "proficiency": "string|null"}],
    "certifications": [{"name": "string", "issuer": "string|null", "date": "string|null", "credential_id": "string|null", "url": "string|null"}],
    "projects": [{"name": "string", "url": "string|null", "description": "string|null", "highlights": ["string"], "technologies": ["string"]}],
    "publications": [{"title": "string", "publisher": "string|null", "date": "string|null", "url": "string|null"}],
    "awards": [{"title": "string", "issuer": "string|null", "date": "string|null", "description": "string|null"}],
    "volunteering": [{"role": "string", "organisation": "string|null", "location": "string|null", "start_date": "string|null", "end_date": "string|null", "highlights": ["string"]}],
    "memberships": [{"name": "string", "organisation": "string|null", "date": "string|null"}],
    "references": [{"name": "string", "title": "string|null", "company": "string|null", "email": "string|null", "phone": "string|null"}],
    "interests": ["string"],
    "technical_skills": [{"name": "string", "level": "string|null"}],
    "soft_skills": ["string"],
    "additional_sections": [{"title": "string", "items": [{"label": "string|null", "value": "string|null", "details": "string|null"}]}]
  },
  "formatted_cv_text": "string - full CV as tidy plain text",
  "extra_context": "string|null - dense text block of all remaining facts useful for job application autofill"
}
JSON;

        return [
            'filename' => $filename,
            'schema' => $schema,
            'raw_text' => $rawText,
        ];
    }

    /**
     * @param  array<string, mixed>  $parsed
     * @param  array<int, string>  $extractedUrls
     * @return array<string, mixed>
     */
    public static function normalize(array $parsed, array $extractedUrls = []): array
    {
        $structured = array_merge(
            self::emptyStructuredData(),
            is_array($parsed['structured_data'] ?? null) ? $parsed['structured_data'] : [],
        );

        if (filled($parsed['headline'] ?? null) && blank($structured['headline'])) {
            $structured['headline'] = $parsed['headline'];
        }

        $experience = self::normalizeExperience(is_array($parsed['experience'] ?? null) ? $parsed['experience'] : []);
        $education = self::normalizeEducation(is_array($parsed['education'] ?? null) ? $parsed['education'] : []);

        $extraContext = is_string($parsed['extra_context'] ?? null)
            ? trim($parsed['extra_context'])
            : self::buildExtraContext($structured, $experience, $education);

        $normalized = [
            'full_name' => self::nullableString($parsed['full_name'] ?? null),
            'headline' => self::nullableString($parsed['headline'] ?? $structured['headline'] ?? null),
            'email' => self::nullableString($parsed['email'] ?? null),
            'phone' => self::nullableString($parsed['phone'] ?? null),
            'location' => self::nullableString($parsed['location'] ?? null),
            'city' => self::nullableString($parsed['city'] ?? null),
            'postcode' => self::nullableString($parsed['postcode'] ?? null),
            'country' => self::nullableString($parsed['country'] ?? null),
            'linkedin_url' => self::nullableString($parsed['linkedin_url'] ?? null),
            'website_url' => self::nullableString($parsed['website_url'] ?? null),
            'summary' => self::nullableString($parsed['summary'] ?? null),
            'skills' => self::normalizeStringList($parsed['skills'] ?? []),
            'experience' => $experience,
            'education' => $education,
            'structured_data' => $structured,
            'formatted_cv_text' => self::nullableString($parsed['formatted_cv_text'] ?? null),
            'extra_context' => $extraContext !== '' ? $extraContext : null,
        ];

        return self::mergeExtractedUrls($normalized, $extractedUrls);
    }

    /**
     * @param  array<int, string>  $urls
     */
    public static function appendHyperlinksToRawText(string $rawText, array $urls): string
    {
        $urls = collect($urls)
            ->filter(fn (string $url) => self::isHttpUrl($url))
            ->unique()
            ->values()
            ->all();

        if ($urls === []) {
            return $rawText;
        }

        $block = collect($urls)
            ->map(fn (string $url): string => '- '.$url)
            ->implode("\n");

        return trim($rawText)."\n\n--- EXTRACTED HYPERLINKS (from PDF annotations; use these exact URLs for link fields) ---\n".$block;
    }

    /**
     * @param  array<string, mixed>  $profile
     * @param  array<int, string>  $extractedUrls
     * @return array<string, mixed>
     */
    public static function mergeExtractedUrls(array $profile, array $extractedUrls): array
    {
        $urls = collect($extractedUrls)
            ->filter(fn (string $url) => self::isHttpUrl($url))
            ->unique()
            ->values();

        if ($urls->isEmpty()) {
            return self::sanitizeUrlFields($profile);
        }

        $linkedin = $urls->first(fn (string $url): bool => self::hostContains($url, 'linkedin.com'));
        $github = $urls->first(fn (string $url): bool => self::hostContains($url, 'github.com'));

        if (! self::isHttpUrl($profile['linkedin_url'] ?? null) && is_string($linkedin)) {
            $profile['linkedin_url'] = $linkedin;
        }

        if (! self::isHttpUrl($profile['website_url'] ?? null)) {
            $website = $urls->first(function (string $url) use ($linkedin, $github): bool {
                if ($url === $linkedin || $url === $github) {
                    return false;
                }

                return ! self::hostContains($url, 'google.com')
                    && ! self::hostContains($url, 'maps.');
            });

            if (is_string($website)) {
                $profile['website_url'] = $website;
            }
        }

        $socialLinks = is_array($profile['structured_data']['social_links'] ?? null)
            ? $profile['structured_data']['social_links']
            : [];

        $socialLinks = self::mergeSocialLink($socialLinks, 'GitHub', $github);
        $socialLinks = self::mergeSocialLink($socialLinks, 'LinkedIn', $linkedin);

        foreach ($urls as $url) {
            if ($url === $linkedin || $url === $github) {
                continue;
            }

            if (self::hostContains($url, 'google.com')) {
                continue;
            }

            $label = parse_url($url, PHP_URL_HOST) ?: 'Website';
            $socialLinks = self::mergeSocialLink($socialLinks, $label, $url);
        }

        $profile['structured_data']['social_links'] = array_values($socialLinks);

        return self::sanitizeUrlFields($profile);
    }

    /**
     * @param  array<int, mixed>  $items
     * @return array<int, array<string, mixed>>
     */
    private static function normalizeExperience(array $items): array
    {
        return collect($items)
            ->filter(fn ($item) => is_array($item))
            ->map(function (array $item): array {
                $highlights = self::normalizeStringList($item['highlights'] ?? []);
                $description = self::nullableString($item['description'] ?? null);

                if ($description !== null && self::descriptionDuplicatesHighlights($description, $highlights)) {
                    $description = null;
                }

                if ($description !== null && self::descriptionDuplicatesSummary($description, $highlights)) {
                    $description = null;
                }

                return [
                    'title' => self::nullableString($item['title'] ?? null) ?? '',
                    'company' => self::nullableString($item['company'] ?? null) ?? '',
                    'location' => self::nullableString($item['location'] ?? null),
                    'employment_type' => self::nullableString($item['employment_type'] ?? null),
                    'start_date' => self::nullableString($item['start_date'] ?? null),
                    'end_date' => self::nullableString($item['end_date'] ?? null),
                    'is_current' => (bool) ($item['is_current'] ?? false),
                    'description' => $description,
                    'highlights' => $highlights,
                    'technologies' => self::normalizeStringList($item['technologies'] ?? []),
                ];
            })
            ->filter(fn (array $item) => $item['title'] !== '' || $item['company'] !== '')
            ->values()
            ->all();
    }

    /**
     * @param  array<int, mixed>  $items
     * @return array<int, array<string, mixed>>
     */
    private static function normalizeEducation(array $items): array
    {
        return collect($items)
            ->filter(fn ($item) => is_array($item))
            ->map(function (array $item): array {
                $highlights = self::normalizeStringList($item['highlights'] ?? []);

                return [
                    'degree' => self::nullableString($item['degree'] ?? null) ?? '',
                    'field_of_study' => self::nullableString($item['field_of_study'] ?? null),
                    'institution' => self::nullableString($item['institution'] ?? null) ?? '',
                    'location' => self::nullableString($item['location'] ?? null),
                    'start_date' => self::nullableString($item['start_date'] ?? null),
                    'end_date' => self::nullableString($item['end_date'] ?? null),
                    'grade' => self::nullableString($item['grade'] ?? null),
                    'honours' => self::nullableString($item['honours'] ?? null),
                    'description' => self::nullableString($item['description'] ?? null),
                    'highlights' => $highlights,
                ];
            })
            ->filter(fn (array $item) => $item['degree'] !== '' || $item['institution'] !== '')
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $structured
     * @param  array<int, array<string, mixed>>  $experience
     * @param  array<int, array<string, mixed>>  $education
     */
    private static function buildExtraContext(array $structured, array $experience, array $education): string
    {
        $sections = [];

        foreach ($structured['languages'] as $language) {
            if (is_array($language) && filled($language['language'] ?? null)) {
                $sections[] = 'Language: '.$language['language'].(filled($language['proficiency'] ?? null) ? ' ('.$language['proficiency'].')' : '');
            }
        }

        foreach ($structured['certifications'] as $cert) {
            if (is_array($cert) && filled($cert['name'] ?? null)) {
                $sections[] = 'Certification: '.$cert['name'];
            }
        }

        foreach ($structured['projects'] as $project) {
            if (is_array($project) && filled($project['name'] ?? null)) {
                $sections[] = 'Project: '.$project['name'];
            }
        }

        foreach ($experience as $role) {
            foreach ($role['highlights'] as $highlight) {
                $sections[] = $role['title'].' at '.$role['company'].': '.$highlight;
            }
        }

        return implode("\n", $sections);
    }

    /**
     * @return array<int, string>
     */
    private static function normalizeStringList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->filter(fn ($item) => is_string($item) && trim($item) !== '')
            ->map(fn (string $item) => trim($item))
            ->values()
            ->all();
    }

    private static function nullableString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @param  array<int, string>  $highlights
     */
    private static function descriptionDuplicatesHighlights(string $description, array $highlights): bool
    {
        if ($highlights === []) {
            return false;
        }

        return self::normalizeComparableText($description) === self::normalizeComparableText(
            implode("\n", array_map(fn (string $line) => '• '.$line, $highlights))
        );
    }

    /**
     * @param  array<int, string>  $highlights
     */
    private static function descriptionDuplicatesSummary(string $description, array $highlights): bool
    {
        if ($highlights === []) {
            return false;
        }

        $descriptionWords = str_word_count(strtolower($description));

        if ($descriptionWords < 12) {
            return false;
        }

        $firstHighlight = strtolower($highlights[0]);

        return str_starts_with(strtolower($description), substr($firstHighlight, 0, min(40, strlen($firstHighlight))));
    }

    private static function normalizeComparableText(string $text): string
    {
        $text = strtolower($text);
        $text = preg_replace('/[^\p{L}\p{N}\s]/u', '', $text) ?? $text;

        return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
    }

    private static function isHttpUrl(?string $value): bool
    {
        if (! is_string($value) || $value === '') {
            return false;
        }

        if (! filter_var($value, FILTER_VALIDATE_URL)) {
            return false;
        }

        $scheme = strtolower(parse_url($value, PHP_URL_SCHEME) ?? '');

        return in_array($scheme, ['http', 'https'], true);
    }

    private static function hostContains(string $url, string $needle): bool
    {
        $host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');

        return str_contains($host, strtolower($needle));
    }

    /**
     * @param  array<int, array<string, mixed>>  $socialLinks
     * @return array<int, array<string, mixed>>
     */
    private static function mergeSocialLink(array $socialLinks, string $label, ?string $url): array
    {
        if (! is_string($url) || ! self::isHttpUrl($url)) {
            return $socialLinks;
        }

        foreach ($socialLinks as &$link) {
            if (! is_array($link)) {
                continue;
            }

            $existingLabel = strtolower((string) ($link['label'] ?? ''));
            $existingUrl = $link['url'] ?? null;

            if ($existingLabel === strtolower($label) || (! self::isHttpUrl($existingUrl) && $existingLabel !== '')) {
                $link['label'] = $label;
                $link['url'] = $url;

                return $socialLinks;
            }
        }

        unset($link);

        $socialLinks[] = [
            'label' => $label,
            'url' => $url,
        ];

        return $socialLinks;
    }

    /**
     * @param  array<string, mixed>  $profile
     * @return array<string, mixed>
     */
    private static function sanitizeUrlFields(array $profile): array
    {
        if (! self::isHttpUrl($profile['linkedin_url'] ?? null)) {
            $profile['linkedin_url'] = null;
        }

        if (! self::isHttpUrl($profile['website_url'] ?? null)) {
            $profile['website_url'] = null;
        }

        if (is_array($profile['structured_data']['social_links'] ?? null)) {
            $profile['structured_data']['social_links'] = collect($profile['structured_data']['social_links'])
                ->filter(fn ($link) => is_array($link))
                ->map(function (array $link): array {
                    if (! self::isHttpUrl($link['url'] ?? null)) {
                        $link['url'] = null;
                    }

                    return $link;
                })
                ->values()
                ->all();
        }

        return $profile;
    }
}
