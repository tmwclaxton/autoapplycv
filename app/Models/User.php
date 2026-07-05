<?php

namespace App\Models;

use App\Enums\SubscriptionStatus;
use App\Enums\SubscriptionTier;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'workos_id', 'avatar'])]
#[Hidden(['workos_id', 'remember_token', 'gocardless_mandate_id', 'gocardless_subscription_id', 'gocardless_billing_request_id'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'ai_tokens_period_start' => 'datetime',
        ];
    }

    public function subscriptionTier(): SubscriptionTier
    {
        return SubscriptionTier::resolve($this->subscription_tier);
    }

    public function subscriptionStatus(): SubscriptionStatus
    {
        return SubscriptionStatus::tryFrom($this->subscription_status)
            ?? SubscriptionStatus::Active;
    }

    public function cvProfile(): HasOne
    {
        return $this->hasOne(CvProfile::class);
    }

    public function cvUploads(): HasMany
    {
        return $this->hasMany(CvUpload::class);
    }

    public function profileDocuments(): HasMany
    {
        return $this->hasMany(ProfileDocument::class);
    }

    public function jobApplications(): HasMany
    {
        return $this->hasMany(JobApplication::class);
    }

    public function extensionPageCaptures(): HasMany
    {
        return $this->hasMany(ExtensionPageCapture::class);
    }

    public function isAdmin(): bool
    {
        return in_array($this->email, config('admin.allowed_emails', []), true);
    }
}
