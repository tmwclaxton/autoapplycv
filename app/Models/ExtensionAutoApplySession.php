<?php

namespace App\Models;

use App\Enums\ExtensionAutoApplySessionStatus;
use Database\Factories\ExtensionAutoApplySessionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'user_id',
    'platform',
    'role_description',
    'status',
    'max_applications',
    'jobs_found',
    'applied_count',
    'skipped_count',
    'error_count',
    'fields_filled_count',
    'started_at',
    'stopped_at',
    'last_error',
])]
class ExtensionAutoApplySession extends Model
{
    /** @use HasFactory<ExtensionAutoApplySessionFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => ExtensionAutoApplySessionStatus::class,
            'started_at' => 'datetime',
            'stopped_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<ExtensionAutoApplyEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(ExtensionAutoApplyEvent::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toAdminArray(): array
    {
        return [
            'id' => $this->id,
            'platform' => $this->platform,
            'role_description' => $this->role_description,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'max_applications' => $this->max_applications,
            'jobs_found' => $this->jobs_found,
            'applied_count' => $this->applied_count,
            'skipped_count' => $this->skipped_count,
            'error_count' => $this->error_count,
            'fields_filled_count' => $this->fields_filled_count,
            'started_at' => $this->started_at?->toIso8601String(),
            'stopped_at' => $this->stopped_at?->toIso8601String(),
            'last_error' => $this->last_error,
            'user' => [
                'id' => $this->user?->id,
                'name' => $this->user?->name,
                'email' => $this->user?->email,
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toAdminDetailArray(): array
    {
        return [
            ...$this->toAdminArray(),
            'events' => $this->events
                ->map(fn (ExtensionAutoApplyEvent $event): array => $event->toAdminArray())
                ->values()
                ->all(),
        ];
    }
}
