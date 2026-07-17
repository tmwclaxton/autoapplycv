<?php

namespace App\Support;

class CoverLetterDesignSettings
{
    public const RANDOM = 'random';

    public static function defaultDesign(): string
    {
        return (string) config('cover-letter.design.default', 'teal-masthead');
    }

    public static function defaultFont(): string
    {
        return (string) config('cover-letter.font.default', 'clash-display');
    }

    /**
     * @return array<string, array{id: string, slug: string, title: string, blurb: string, accent: string}>
     */
    public static function designs(): array
    {
        /** @var array<string, array{id: string, slug: string, title: string, blurb: string, accent: string}> $designs */
        $designs = config('cover-letter.design.variants', []);

        return $designs;
    }

    /**
     * @return array<string, array{label: string, display: string, body: string, stylesheet: string, pdf_base: string}>
     */
    public static function fonts(): array
    {
        /** @var array<string, array{label: string, display: string, body: string, stylesheet: string, pdf_base: string}> $fonts */
        $fonts = config('cover-letter.font.families', []);

        return $fonts;
    }

    /**
     * @return list<string>
     */
    public static function designKeys(): array
    {
        return array_keys(self::designs());
    }

    /**
     * @return list<string>
     */
    public static function fontKeys(): array
    {
        return array_keys(self::fonts());
    }

    /**
     * @return list<string>
     */
    public static function designPreferenceKeys(): array
    {
        return [...self::designKeys(), self::RANDOM];
    }

    /**
     * @return list<string>
     */
    public static function fontPreferenceKeys(): array
    {
        return [...self::fontKeys(), self::RANDOM];
    }

    public static function isRandom(?string $value): bool
    {
        return is_string($value) && trim($value) === self::RANDOM;
    }

    public static function normalizeDesign(?string $design): string
    {
        $design = is_string($design) ? trim($design) : '';

        if ($design === self::RANDOM) {
            return self::RANDOM;
        }

        if ($design !== '' && isset(self::designs()[$design])) {
            return $design;
        }

        return self::defaultDesign();
    }

    public static function normalizeFont(?string $font): string
    {
        $font = is_string($font) ? trim($font) : '';

        if ($font === self::RANDOM) {
            return self::RANDOM;
        }

        if ($font !== '' && isset(self::fonts()[$font])) {
            return $font;
        }

        return self::defaultFont();
    }

    /**
     * @return array{cover_letter_design: string, cover_letter_font: string}
     */
    public static function normalize(?string $design, ?string $font): array
    {
        return [
            'cover_letter_design' => self::normalizeDesign($design),
            'cover_letter_font' => self::normalizeFont($font),
        ];
    }

    /**
     * @return array{cover_letter_design: string, cover_letter_font: string, design_preference: string, font_preference: string}
     */
    public static function resolveForGeneration(?string $design, ?string $font): array
    {
        $preferences = self::normalize($design, $font);
        $resolvedDesign = $preferences['cover_letter_design'] === self::RANDOM
            ? self::pickRandomDesign()
            : $preferences['cover_letter_design'];
        $resolvedFont = $preferences['cover_letter_font'] === self::RANDOM
            ? self::pickRandomFont()
            : $preferences['cover_letter_font'];

        return [
            'cover_letter_design' => $resolvedDesign,
            'cover_letter_font' => $resolvedFont,
            'design_preference' => $preferences['cover_letter_design'],
            'font_preference' => $preferences['cover_letter_font'],
        ];
    }

    public static function pickRandomDesign(): string
    {
        $keys = self::designKeys();

        return $keys[array_rand($keys)];
    }

    public static function pickRandomFont(): string
    {
        $keys = self::fontKeys();

        return $keys[array_rand($keys)];
    }

    /**
     * @return array{label: string, display: string, body: string, stylesheet: string, pdf_base: string}
     */
    public static function fontDefinition(string $font): array
    {
        $key = self::normalizeFont($font);

        if ($key === self::RANDOM) {
            throw new \InvalidArgumentException('Cannot load font definition for random preference. Resolve first.');
        }

        return self::fonts()[$key];
    }

    /**
     * @return array{id: string, slug: string, title: string, blurb: string, accent: string}
     */
    public static function designDefinition(string $design): array
    {
        $key = self::normalizeDesign($design);

        if ($key === self::RANDOM) {
            throw new \InvalidArgumentException('Cannot load design definition for random preference. Resolve first.');
        }

        return self::designs()[$key];
    }

    public static function designCss(string $design): string
    {
        $slug = self::normalizeDesign($design);

        if ($slug === self::RANDOM) {
            throw new \InvalidArgumentException('Cannot load design CSS for random preference. Resolve first.');
        }

        $path = resource_path('cover-letter/designs/'.$slug.'.css');

        if (! is_file($path)) {
            throw new \RuntimeException("Missing cover letter design stylesheet for [{$slug}].");
        }

        return (string) file_get_contents($path);
    }

    /**
     * Hex accent to PDF RGB floats (0-1).
     *
     * @return array{0: float, 1: float, 2: float}
     */
    public static function accentRgb(string $design): array
    {
        $hex = ltrim(self::designDefinition($design)['accent'], '#');

        if (strlen($hex) !== 6) {
            return [0.059, 0.463, 0.435];
        }

        return [
            hexdec(substr($hex, 0, 2)) / 255,
            hexdec(substr($hex, 2, 2)) / 255,
            hexdec(substr($hex, 4, 2)) / 255,
        ];
    }

    /**
     * James Mitchell sample used by the dashboard live preview.
     *
     * @return array<string, mixed>
     */
    public static function sampleLetter(): array
    {
        return [
            'full_name' => 'James Mitchell',
            'headline' => 'Senior Laravel Developer',
            'email' => 'james.mitchell@example.com',
            'phone' => '+44 7837 370669',
            'location' => 'London, United Kingdom',
            'linkedin_url' => 'linkedin.com/in/james-mitchell',
            'website_url' => 'jamesmitchell.dev',
            'company' => 'Northwind Labs',
            'job_title' => 'Senior Laravel Developer',
            'date' => '17 July 2026',
            'greeting' => 'Dear Hiring Manager,',
            'paragraphs' => [
                'I am applying for the Senior Laravel Developer role at Northwind Labs because your platform work sits at the intersection of Laravel APIs and Vue product UI - the stack I have owned end to end for several years.',
                'As Senior Software Engineer at Riverbank Systems, I led a monolith-to-microservices migration serving 40k daily users and built Vue 3 admin tooling with Inertia. I am used to shipping schema changes, caching improvements, and production observability without handing work off mid-flight.',
                'I would welcome a conversation about how that delivery experience could help Northwind Labs ship reliable platform features at pace.',
            ],
            'signoff' => 'Yours faithfully,',
        ];
    }

    /**
     * @return array{
     *     default_design: string,
     *     default_font: string,
     *     designs: list<array{id: string, slug: string, title: string, blurb: string, accent: string, css: string}>,
     *     fonts: list<array{key: string, label: string, display: string, body: string, stylesheet: string}>,
     *     sample: array<string, mixed>
     * }
     */
    public static function optionsForFrontend(): array
    {
        $designs = [];

        foreach (self::designs() as $slug => $design) {
            $designs[] = [
                'id' => $design['id'],
                'slug' => $slug,
                'title' => $design['title'],
                'blurb' => $design['blurb'],
                'accent' => $design['accent'],
                'css' => self::designCss($slug),
            ];
        }

        $fonts = [];

        foreach (self::fonts() as $key => $font) {
            $fonts[] = [
                'key' => $key,
                'label' => $font['label'],
                'display' => $font['display'],
                'body' => $font['body'],
                'stylesheet' => $font['stylesheet'],
            ];
        }

        return [
            'default_design' => self::defaultDesign(),
            'default_font' => self::defaultFont(),
            'designs' => $designs,
            'fonts' => $fonts,
            'sample' => self::sampleLetter(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function validationRules(): array
    {
        return [
            'cover_letter_design' => ['nullable', 'string', 'in:'.implode(',', self::designPreferenceKeys())],
            'cover_letter_font' => ['nullable', 'string', 'in:'.implode(',', self::fontPreferenceKeys())],
        ];
    }
}
