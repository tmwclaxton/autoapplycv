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

    public function cvParsesPerMonthLabel(): string
    {
        $tokens = $this->monthlyTokens();
        $low = max(1, (int) floor($tokens / 7000));
        $high = max(1, (int) floor($tokens / 2500));

        if ($low === $high) {
            return "~{$high} CV parses";
        }

        return "~{$low}–{$high} CV parses";
    }

    /**
     * @return array{
     *     key: string,
     *     name: string,
     *     description: string,
     *     price: string,
     *     price_pence: int,
     *     monthly_tokens: int,
     *     cv_parses_label: string,
     *     is_paid: bool,
     * }
     */
    public function toMarketingArray(): array
    {
        return [
            'key' => $this->value,
            'name' => $this->label(),
            'description' => $this->description(),
            'price' => $this->formattedPrice(),
            'price_pence' => $this->pricePence(),
            'monthly_tokens' => $this->monthlyTokens(),
            'cv_parses_label' => $this->cvParsesPerMonthLabel(),
            'is_paid' => $this->isPaid(),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function marketingTiers(): array
    {
        return array_map(
            fn (self $tier) => $tier->toMarketingArray(),
            self::ordered(),
        );
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
