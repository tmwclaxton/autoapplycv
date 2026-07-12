<?php

namespace App\Enums;

enum ProfileDocumentCategory: string
{
    case Cv = 'cv';
    case Certificate = 'certificate';
    case Transcript = 'transcript';
    case Reference = 'reference';
    case Portfolio = 'portfolio';
    case CoverLetter = 'cover_letter';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Cv => 'CV / Résumé',
            self::Certificate => 'Certificate / Qualification',
            self::Transcript => 'Transcript',
            self::Reference => 'Reference letter',
            self::Portfolio => 'Portfolio / Work sample',
            self::CoverLetter => 'Cover letter',
            self::Other => 'Other',
        };
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    public static function manualUploadOptions(): array
    {
        return collect(self::cases())
            ->reject(fn (self $category): bool => in_array($category, [self::Cv, self::CoverLetter], true))
            ->map(fn (self $category): array => [
                'value' => $category->value,
                'label' => $category->label(),
            ])
            ->values()
            ->all();
    }

    /**
     * Categories shown in document upload dropdowns (CV uploads use a separate flow).
     *
     * @return array<int, array{value: string, label: string}>
     */
    public static function uploadOptions(): array
    {
        return collect(self::cases())
            ->reject(fn (self $category): bool => $category === self::CoverLetter)
            ->map(fn (self $category): array => [
                'value' => $category->value,
                'label' => $category->label(),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    public static function options(): array
    {
        return collect(self::cases())
            ->map(fn (self $category): array => [
                'value' => $category->value,
                'label' => $category->label(),
            ])
            ->values()
            ->all();
    }
}
