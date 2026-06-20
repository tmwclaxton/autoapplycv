<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CvUpload extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'original_filename',
        'stored_path',
        'mime_type',
        'file_size',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
