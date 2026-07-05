<?php

namespace App\Models;

use Database\Factories\ExtensionPageCaptureFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'url',
    'page_title',
    'domain',
    'platform',
    'html',
])]
class ExtensionPageCapture extends Model
{
    /** @use HasFactory<ExtensionPageCaptureFactory> */
    use HasFactory;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toAdminArray(): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url,
            'page_title' => $this->page_title,
            'domain' => $this->domain,
            'platform' => $this->platform,
            'user' => [
                'id' => $this->user?->id,
                'name' => $this->user?->name,
                'email' => $this->user?->email,
            ],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
