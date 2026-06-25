<?php

namespace App\Models;

use App\Enums\BlogStatus;
use Carbon\Carbon;
use Database\Factories\BlogFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * @property int $id
 * @property string $title
 * @property string $slug
 * @property string $excerpt
 * @property string $body
 * @property string|null $image_url
 * @property array<int, string>|null $tags
 * @property array<int, array<string, mixed>>|null $sources
 * @property BlogStatus $status
 * @property Carbon|null $published_at
 * @property int $view_count
 */
class Blog extends Model
{
    /** @use HasFactory<BlogFactory> */
    use HasFactory;

    protected $fillable = [
        'title',
        'slug',
        'excerpt',
        'body',
        'image_url',
        'tags',
        'sources',
        'status',
        'published_at',
        'view_count',
    ];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
            'sources' => 'array',
            'status' => BlogStatus::class,
            'published_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', BlogStatus::Published)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }

    /**
     * Resolve stored path or legacy full URL to a public URL.
     */
    public function getImageUrlAttribute(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (str_contains($value, '://')) {
            return $value;
        }

        $diskName = (string) config('blog.hero_image_disk', 'public');

        try {
            return Storage::disk($diskName)->url($value);
        } catch (Throwable) {
            return null;
        }
    }
}
