<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CvProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'full_name',
        'email',
        'phone',
        'location',
        'linkedin_url',
        'website_url',
        'summary',
        'skills',
        'experience',
        'education',
        'extra_context',
        'raw_cv_text',
        'parsing_complete',
    ];

    protected function casts(): array
    {
        return [
            'skills' => 'array',
            'experience' => 'array',
            'education' => 'array',
            'parsing_complete' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
