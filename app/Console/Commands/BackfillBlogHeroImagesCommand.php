<?php

namespace App\Console\Commands;

use App\Models\Blog;
use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use Illuminate\Console\Command;

class BackfillBlogHeroImagesCommand extends Command
{
    protected $signature = 'blog:backfill-hero-images
                            {--slug= : Only backfill a single post by slug}';

    protected $description = 'Generate hero images for published blog posts that are missing one';

    public function handle(NanoGptService $nanoGpt, NanoGptBlogHeroImageService $heroImages): int
    {
        $query = Blog::query()
            ->published()
            ->where(function ($query): void {
                $query->whereNull('image_url')->orWhere('image_url', '');
            });

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        }

        $posts = $query->orderBy('published_at')->get();

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

            $post->update(['image_url' => $imagePath]);
            $this->info("  Stored: {$imagePath}");
        }

        return self::SUCCESS;
    }
}
