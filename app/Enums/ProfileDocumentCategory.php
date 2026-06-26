<?php

namespace App\Enums;

enum ProfileDocumentCategory: string
{
    case Cv = 'cv';
    case Certificate = 'certificate';
    case Transcript = 'transcript';
    case Reference = 'reference';
    case Portfolio = 'portfolio';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Cv => 'CV / Résumé',
            self::Certificate => 'Certificate / Qualification',
            self::Transcript => 'Transcript',
            self::Reference => 'Reference letter',
            self::Portfolio => 'Portfolio / Work sample',
            self::Other => 'Other',
        };
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    public static function manualUploadOptions(): array
    {
        return collect(self::cases())
            ->reject(fn (self $category): bool => $category === self::Cv)
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
