<?php

namespace App\Enums;

enum SubscriptionTier: string
{
    case Free = 'free';
    case Starter = 'starter';
    case Pro = 'pro';
    case Standard = 'standard';
    case Power = 'power';

    public function label(): string
    {
        return config("subscriptions.tiers.{$this->configKey()}.name", ucfirst($this->value));
    }

    public function description(): string
    {
        return config("subscriptions.tiers.{$this->configKey()}.description", '');
    }

    public function pricePence(): int
    {
        return (int) config("subscriptions.tiers.{$this->configKey()}.price_pence", 0);
    }

    public function monthlyCredits(): int
    {
        return (int) config("subscriptions.tiers.{$this->configKey()}.monthly_credits", 0);
    }

    public function isPaid(): bool
    {
        return $this->pricePence() > 0;
    }

    public function isAvailable(): bool
    {
        return (bool) config("subscriptions.tiers.{$this->configKey()}.available", false);
    }

    public function formattedPrice(): string
    {
        if (! $this->isPaid()) {
            return 'Free';
        }

        return '£'.number_format($this->pricePence() / 100, 2).'/mo';
    }

    /**
     * @return array<int, string>
     */
    public function features(): array
    {
        return config("subscriptions.tiers.{$this->configKey()}.features", []);
    }

    /**
     * @return array{
     *     key: string,
     *     name: string,
     *     description: string,
     *     price: string,
     *     price_pence: int,
     *     monthly_credits: int,
     *     features: array<int, string>,
     *     is_paid: bool,
     *     is_available: bool,
     *     coming_soon: bool,
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
            'monthly_credits' => $this->monthlyCredits(),
            'features' => $this->features(),
            'is_paid' => $this->isPaid(),
            'is_available' => $this->isAvailable(),
            'coming_soon' => ! $this->isAvailable() && $this->isPaid(),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function marketingPlans(): array
    {
        return array_map(
            fn (self $tier) => $tier->toMarketingArray(),
            self::visible(),
        );
    }

    /**
     * @return array<int, self>
     */
    public static function visible(): array
    {
        return array_values(array_filter(
            self::ordered(),
            fn (self $tier) => $tier->isAvailable() || ($tier->isPaid() && ! $tier->isAvailable()),
        ));
    }

    /**
     * @return array<int, self>
     */
    public static function ordered(): array
    {
        return [
            self::Free,
            self::Starter,
            self::Pro,
        ];
    }

    public static function resolve(?string $value): self
    {
        $tier = match ($value) {
            'standard' => self::Starter,
            'power' => self::Pro,
            default => self::tryFrom($value ?? ''),
        };

        if ($tier === null) {
            return self::Free;
        }

        if ($tier->isAvailable()) {
            return $tier;
        }

        return self::Free;
    }

    private function configKey(): string
    {
        return match ($this) {
            self::Standard => 'starter',
            self::Power => 'pro',
            default => $this->value,
        };
    }
}
