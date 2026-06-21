<?php

namespace App\Enums;

enum SubscriptionStatus: string
{
    case Active = 'active';
    case Pending = 'pending';
    case Cancelled = 'cancelled';
    case PastDue = 'past_due';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Pending => 'Pending setup',
            self::Cancelled => 'Cancelled',
            self::PastDue => 'Past due',
        };
    }
}
