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
        'headline',
        'email',
        'phone',
        'location',
        'city',
        'postcode',
        'country',
        'linkedin_url',
        'website_url',
        'summary',
        'skills',
        'experience',
        'education',
        'structured_data',
        'extra_context',
        'application_settings',
        'raw_cv_text',
        'formatted_cv_text',
        'parsing_complete',
    ];

    protected function casts(): array
    {
        return [
            'skills' => 'array',
            'experience' => 'array',
            'education' => 'array',
            'structured_data' => 'array',
            'application_settings' => 'array',
            'parsing_complete' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
