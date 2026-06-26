<?php

namespace App\Models;

use App\Enums\ApplicationArtifactType;
use Database\Factories\ApplicationArtifactFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicationArtifact extends Model
{
    /** @use HasFactory<ApplicationArtifactFactory> */
    use HasFactory;

    protected $fillable = [
        'job_application_id',
        'type',
        'title',
        'content',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'type' => ApplicationArtifactType::class,
            'metadata' => 'array',
        ];
    }

    public function jobApplication(): BelongsTo
    {
        return $this->belongsTo(JobApplication::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toFrontendArray(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'type_label' => $this->type->label(),
            'title' => $this->title,
            'content' => $this->content,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
