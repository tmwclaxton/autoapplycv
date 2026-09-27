<?php

namespace App\Models;

use Database\Factories\NanoGptSpendEntryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'period',
    'endpoint',
    'model',
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'cost_usd',
    'cost_gbp',
    'cost_source',
    'remaining_balance_usd',
])]
class NanoGptSpendEntry extends Model
{
    /** @use HasFactory<NanoGptSpendEntryFactory> */
    use HasFactory;

    public const SOURCE_REPORTED = 'reported';

    public const SOURCE_ESTIMATED = 'estimated';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'prompt_tokens' => 'integer',
            'completion_tokens' => 'integer',
            'total_tokens' => 'integer',
            'cost_usd' => 'float',
            'cost_gbp' => 'float',
            'remaining_balance_usd' => 'float',
        ];
    }
}
