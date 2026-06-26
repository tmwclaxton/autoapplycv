<?php

namespace App\Models;

use App\Enums\ApplicationStatus;
use Database\Factories\JobApplicationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobApplication extends Model
{
    /** @use HasFactory<JobApplicationFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'title',
        'company',
        'link',
        'location',
        'job_description',
        'source',
        'status',
        'ats_score',
        'ats_result',
        'notes',
        'applied_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => ApplicationStatus::class,
            'ats_result' => 'array',
            'applied_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function artifacts(): HasMany
    {
        return $this->hasMany(ApplicationArtifact::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toFrontendArray(bool $includeArtifacts = false): array
    {
        $data = [
            'id' => $this->id,
            'title' => $this->title,
            'company' => $this->company,
            'link' => $this->link,
            'location' => $this->location,
            'job_description' => $this->job_description,
            'source' => $this->source,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'ats_score' => $this->ats_score,
            'ats_result' => $this->ats_result,
            'notes' => $this->notes,
            'applied_at' => $this->applied_at?->toIso8601String(),
        ];

        if ($includeArtifacts) {
            $data['artifacts'] = $this->artifacts()
                ->latest()
                ->get()
                ->map(fn (ApplicationArtifact $artifact): array => $artifact->toFrontendArray())
                ->values()
                ->all();
        }

        return $data;
    }
}
