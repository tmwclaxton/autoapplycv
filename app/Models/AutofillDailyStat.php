<?php

namespace App\Models;

use Database\Factories\AutofillDailyStatFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property Carbon $date
 * @property int $answers_count
 * @property int $extension_questions_count
 * @property int $cvs_parsed_count
 */
class AutofillDailyStat extends Model
{
    /** @use HasFactory<AutofillDailyStatFactory> */
    use HasFactory;

    protected $fillable = [
        'date',
        'answers_count',
        'extension_questions_count',
        'cvs_parsed_count',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'answers_count' => 'integer',
            'extension_questions_count' => 'integer',
            'cvs_parsed_count' => 'integer',
        ];
    }
}
