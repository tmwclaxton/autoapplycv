<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class BackfillBlogHeroImagesCommand extends Command
{
    protected $signature = 'blog:backfill-hero-images
                            {--slug= : Only backfill a single post by slug}
                            {--missing-files : Regenerate posts whose image file is missing from disk}';

    protected $description = 'Generate hero images for published blog posts that are missing one';

    public function handle(NanoGptService $nanoGpt, NanoGptBlogHeroImageService $heroImages): int
    {
        $query = Blog::query()->published();

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        }

        $posts = $query->orderBy('published_at')->get();

        $posts = $posts->filter(function (Blog $post): bool {
            if ($this->option('missing-files') && $this->imageFileMissing($post)) {
                return true;
            }

            $rawImageUrl = $post->getRawOriginal('image_url');

            return $rawImageUrl === null || $rawImageUrl === '';
        });

        if ($posts->isEmpty()) {
            $this->info('No posts need hero images.');

            return self::SUCCESS;
        }

        foreach ($posts as $post) {
            $this->line("Generating hero for: {$post->title}");

            $topic = $post->excerpt !== '' ? $post->excerpt : $post->title;
            $imagePrompt = $heroImages->buildPrompt($nanoGpt, $topic);
            $imagePath = $heroImages->generateAndStore($imagePrompt);

            if ($imagePath === null) {
                $this->warn("  Failed: {$post->slug}");

                continue;
            }

            $this->deleteStoredImageIfPresent($post);

            $post->update(['image_url' => $imagePath]);
            $this->info("  Stored: {$imagePath}");
        }

        return self::SUCCESS;
    }

    protected function imageFileMissing(Blog $post): bool
    {
        $path = $this->storedImagePath($post);

        if ($path === null) {
            return false;
        }

        $diskName = (string) config('blog.hero_image_disk', 'public');

        return ! Storage::disk($diskName)->exists($path);
    }

    protected function storedImagePath(Blog $post): ?string
    {
        $value = $post->getRawOriginal('image_url');

        if (! is_string($value) || $value === '') {
            return null;
        }

        if (str_contains($value, '://')) {
            return null;
        }

        return $value;
    }

    protected function deleteStoredImageIfPresent(Blog $post): void
    {
        $path = $this->storedImagePath($post);

        if ($path === null) {
            return;
        }

        $diskName = (string) config('blog.hero_image_disk', 'public');
        Storage::disk($diskName)->delete($path);
    }
}
