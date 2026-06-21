<?php

namespace App\Enums;

enum SubscriptionTier: string
{
    case Free = 'free';
    case Standard = 'standard';
    case Pro = 'pro';
    case Power = 'power';

    public function label(): string
    {
        return config("subscriptions.tiers.{$this->value}.name", ucfirst($this->value));
    }

    public function description(): string
    {
        return config("subscriptions.tiers.{$this->value}.description", '');
    }

    public function pricePence(): int
    {
        return (int) config("subscriptions.tiers.{$this->value}.price_pence", 0);
    }

    public function monthlyTokens(): int
    {
        return (int) config("subscriptions.tiers.{$this->value}.monthly_tokens", 0);
    }

    public function isPaid(): bool
    {
        return $this->pricePence() > 0;
    }

    public function formattedPrice(): string
    {
        if (! $this->isPaid()) {
            return 'Free';
        }

        return '£'.number_format($this->pricePence() / 100, 2).'/mo';
    }

    /**
     * @return array<int, self>
     */
    public static function ordered(): array
    {
        return [
            self::Free,
            self::Standard,
            self::Pro,
            self::Power,
        ];
    }
}
