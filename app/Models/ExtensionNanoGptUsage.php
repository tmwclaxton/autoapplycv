<?php

namespace App\Models;

use Database\Factories\ExtensionNanoGptUsageFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'action',
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'nanogpt_credits',
    'autofill_cost',
    'model',
])]
class ExtensionNanoGptUsage extends Model
{
    /** @use HasFactory<ExtensionNanoGptUsageFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'nanogpt_credits' => 'float',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
