<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use App\Support\BlogHeroSceneVariety;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class BackfillBlogHeroImagesCommand extends Command
{
    protected $signature = 'blog:backfill-hero-images
                            {--slug= : Only backfill a single post by slug}
                            {--missing-files : Regenerate posts whose image file is missing from disk}
                            {--force : Regenerate heroes even when an image already exists (use after prompt upgrades)}
                            {--cliche : Only posts whose topic maps to a laptop-cliche scene; regenerate with an alternate scene}
                            {--limit= : Max posts to process (useful with --force / --cliche)}
                            {--published-only : Restrict to published posts (default for --force/--cliche; missing targets all statuses)}';

    protected $description = 'Generate hero images for blog posts that are missing one (or regenerate with --force / --cliche)';

    public function handle(NanoGptService $nanoGpt, NanoGptBlogHeroImageService $heroImages): int
    {
        $force = (bool) $this->option('force');
        $cliche = (bool) $this->option('cliche');
        $missingFiles = (bool) $this->option('missing-files');
        $publishedOnly = (bool) $this->option('published-only') || $force || $cliche;

        $query = Blog::query();

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        } elseif ($publishedOnly) {
            $query->published();
        }

        $posts = $query->orderBy('published_at')->orderBy('id')->get();

        $posts = $posts->filter(function (Blog $post) use ($force, $cliche, $missingFiles, $heroImages): bool {
            if ($this->option('slug')) {
                return $force || $cliche || $missingFiles || $this->imageUrlMissing($post) || $this->imageFileMissing($post);
            }

            if ($cliche) {
                if ($this->imageUrlMissing($post)) {
                    return true;
                }

                return $this->mapsToLaptopCliche($post, $heroImages);
            }

            if ($force) {
                return true;
            }

            if ($missingFiles && $this->imageFileMissing($post)) {
                return true;
            }

            return $this->imageUrlMissing($post);
        })->values();

        $limit = $this->option('limit');
        if ($limit !== null && $limit !== '' && (int) $limit > 0) {
            $posts = $posts->take((int) $limit)->values();
        }

        if ($posts->isEmpty()) {
            $this->info('No posts need hero images.');

            return self::SUCCESS;
        }

        $failed = [];

        foreach ($posts as $post) {
            $this->line("Generating hero for: {$post->title}");

            $topic = $post->excerpt !== '' ? $post->excerpt : $post->title;
            $context = [
                'slug' => $post->slug,
                'title' => $post->title,
                'tags' => $post->tags ?? [],
            ];

            if ($cliche && ! $this->imageUrlMissing($post) && $this->mapsToLaptopCliche($post, $heroImages)) {
                $context['scene_offset'] = 1;
            }

            $scene = $heroImages->resolveScene($topic, $context);
            $this->line("  Scene: {$scene['id']} ({$scene['label']})");

            $imagePrompt = $heroImages->buildPrompt($nanoGpt, $topic, $context);
            $imagePath = $heroImages->generateAndStore($imagePrompt);

            if ($imagePath === null) {
                $this->warn("  Failed: {$post->slug}");
                $failed[] = $post->slug;

                continue;
            }

            $this->deleteStoredImageIfPresent($post);

            $post->update(['image_url' => $imagePath]);
            $this->info("  Stored: {$imagePath}");
        }

        if ($failed !== []) {
            $this->newLine();
            $this->warn('Failed slugs: '.implode(', ', $failed));
        }

        return $failed === [] ? self::SUCCESS : self::FAILURE;
    }

    protected function imageUrlMissing(Blog $post): bool
    {
        $rawImageUrl = $post->getRawOriginal('image_url');

        return $rawImageUrl === null || $rawImageUrl === '';
    }

    protected function mapsToLaptopCliche(Blog $post, NanoGptBlogHeroImageService $heroImages): bool
    {
        $topic = $post->excerpt !== '' ? $post->excerpt : $post->title;
        $scene = $heroImages->resolveScene($topic, [
            'slug' => $post->slug,
            'title' => $post->title,
            'tags' => $post->tags ?? [],
            'scene_offset' => 0,
        ]);

        return BlogHeroSceneVariety::isLaptopClicheScene($scene['id']);
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
