<?php

namespace App\Enums;

enum ApplicationStatus: string
{
    case Applied = 'applied';
    case Screening = 'screening';
    case Interview = 'interview';
    case Offer = 'offer';
    case Rejected = 'rejected';
    case Withdrawn = 'withdrawn';

    public function label(): string
    {
        return match ($this) {
            self::Applied => 'Applied',
            self::Screening => 'Screening',
            self::Interview => 'Interview',
            self::Offer => 'Offer',
            self::Rejected => 'Rejected',
            self::Withdrawn => 'Withdrawn',
        };
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    public static function options(): array
    {
        return array_map(
            fn (self $status): array => [
                'value' => $status->value,
                'label' => $status->label(),
            ],
            self::cases(),
        );
    }
}
