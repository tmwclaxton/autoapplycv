<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'period',
    'threshold_percent',
    'sent_at',
])]
class NanoGptSpendAlert extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'threshold_percent' => 'integer',
            'sent_at' => 'datetime',
        ];
    }
}
