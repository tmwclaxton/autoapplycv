<?php

namespace App\Models;

use App\Enums\ExtensionAutoApplyEventType;
use Database\Factories\ExtensionAutoApplyEventFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'extension_auto_apply_session_id',
    'event_type',
    'job_title',
    'company',
    'job_url',
    'fields_filled_count',
    'metadata',
    'extension_page_capture_id',
])]
class ExtensionAutoApplyEvent extends Model
{
    /** @use HasFactory<ExtensionAutoApplyEventFactory> */
    use HasFactory;

    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'event_type' => ExtensionAutoApplyEventType::class,
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(ExtensionAutoApplySession::class, 'extension_auto_apply_session_id');
    }

    public function pageCapture(): BelongsTo
    {
        return $this->belongsTo(ExtensionPageCapture::class, 'extension_page_capture_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toAdminArray(): array
    {
        return [
            'id' => $this->id,
            'event_type' => $this->event_type->value,
            'job_title' => $this->job_title,
            'company' => $this->company,
            'job_url' => $this->job_url,
            'fields_filled_count' => $this->fields_filled_count,
            'metadata' => $this->metadata,
            'page_capture_id' => $this->extension_page_capture_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
