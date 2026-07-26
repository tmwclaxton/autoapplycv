<?php

namespace App\Services;

use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogHeroSceneVariety;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class NanoGptBlogHeroImageService
{
    /**
     * Generate a hero image from a text prompt via NanoGPT and store it on the configured disk.
     *
     * @return string|null Storage path (e.g. blogs/heroes/uuid.png), or null on failure.
     */
    public function generateAndStore(string $prompt): ?string
    {
        $prompt = trim($prompt);
        if ($prompt === '') {
            return null;
        }

        $apiKey = config('services.nanogpt.api_key');
        if (! is_string($apiKey) || $apiKey === '') {
            Log::warning('NanoGptBlogHeroImageService: missing NANOGPT_API_KEY; skipping hero image.');

            return null;
        }

        $baseUrl = rtrim((string) config('services.nanogpt.image_base_url'), '/');

        try {
            $response = Http::withToken($apiKey)
                ->timeout(180)
                ->connectTimeout(30)
                ->post("{$baseUrl}/images/generations", [
                    'model' => config('services.nanogpt.image_model'),
                    'prompt' => $prompt,
                    'n' => 1,
                    'size' => config('services.nanogpt.image_size'),
                    'response_format' => 'url',
                ]);

            if (! $response->successful()) {
                Log::warning('NanoGptBlogHeroImageService: image API request failed.', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            $binary = $this->binaryFromResponse($response->json());
            if ($binary === null || $binary === '') {
                Log::warning('NanoGptBlogHeroImageService: empty image bytes from API.');

                return null;
            }

            return $this->storePngAndReturnPath($binary);
        } catch (Throwable $e) {
            Log::warning('NanoGptBlogHeroImageService: unexpected error.', [
                'message' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @param  array<string, mixed>|null  $payload
     */
    protected function binaryFromResponse(?array $payload): ?string
    {
        if (! is_array($payload)) {
            return null;
        }

        $first = $payload['data'][0] ?? null;
        if (! is_array($first)) {
            return null;
        }

        if (isset($first['url']) && is_string($first['url']) && $first['url'] !== '') {
            $download = Http::timeout(120)->get($first['url']);
            if (! $download->successful()) {
                return null;
            }

            return $download->body();
        }

        if (isset($first['b64_json']) && is_string($first['b64_json']) && $first['b64_json'] !== '') {
            $decoded = base64_decode($first['b64_json'], true);

            return $decoded === false ? null : $decoded;
        }

        return null;
    }

    protected function storePngAndReturnPath(string $binary): ?string
    {
        $diskName = (string) config('blog.hero_image_disk');
        $prefix = (string) config('blog.hero_image_path_prefix');
        $normalizedPrefix = $prefix !== '' ? trim($prefix, '/').'/' : '';
        $objectPath = $normalizedPrefix.Str::uuid().'.png';

        $disk = Storage::disk($diskName);

        try {
            if (! $disk->put($objectPath, $binary, ['visibility' => 'public'])) {
                throw new RuntimeException('Storage put returned false.');
            }
        } catch (Throwable $e) {
            Log::warning('NanoGptBlogHeroImageService: storage failed.', [
                'disk' => $diskName,
                'path' => $objectPath,
                'message' => $e->getMessage(),
            ]);

            return null;
        }

        return $objectPath;
    }

    /**
     * @param  array{slug?: string, title?: string, tags?: list<string>, scene_offset?: int}  $context
     */
    public function buildPrompt(NanoGptService $nanoGpt, string $topic, array $context = []): string
    {
        $scene = $this->resolveScene($topic, $context);

        $instructions = <<<INSTRUCTIONS
You are writing a prompt for Recraft V4.1, a professional design-focused AI image generator.
The image will be displayed at a wide 16:9 landscape ratio as a blog hero banner.

Given the blog topic and product summary, return ONE concise paragraph (3-5 sentences) describing a VIVID,
SCENE-BASED illustration - concrete and exciting, not flat stock clipart.

Rules:
- Required scene direction ({$scene['label']}): {$scene['directive']}
- Do NOT default to a face-forward person staring at a laptop unless that scene direction explicitly needs a screen as a secondary prop.
- Energy: dynamic lighting (warm window light, soft lamp glow, golden hour), depth with foreground/midground/background; slight motion without chaos.
- People: silhouetted or stylised figures without detailed faces when people appear; hopeful, focused, quietly triumphant mood.
- Style: rich editorial illustration with layered colour and soft texture - magazine cover energy, not a sterile flat icon set or generic corporate stock.
- Composition: wide landscape (16:9); strong focal point in the centre third; avoid empty sparse backgrounds.
- Colour: warm professional palette (cream paper, warm wood, soft amber light) with optional navy and red accents; high contrast and inviting.
- No text, watermarks, logos, brand marks, or readable on-screen UI. No competitor or job-board branding. No invented product logos.
- Output ONLY the image prompt, nothing else.
INSTRUCTIONS;

        $summary = AutoCVApplyBlogContext::summaryForImagePrompt();
        $title = trim((string) ($context['title'] ?? ''));
        $slug = trim((string) ($context['slug'] ?? ''));
        $tags = $context['tags'] ?? [];
        $tagLine = is_array($tags) && $tags !== []
            ? implode(', ', array_map(static fn ($tag): string => (string) $tag, $tags))
            : '';

        $user = "Blog topic: {$topic}\n";
        if ($title !== '') {
            $user .= "Post title: {$title}\n";
        }
        if ($slug !== '') {
            $user .= "Slug: {$slug}\n";
        }
        if ($tagLine !== '') {
            $user .= "Tags: {$tagLine}\n";
        }
        $user .= "Assigned scene id: {$scene['id']}\n\nProduct summary (for mood only):\n{$summary}\n\nDescribe a vivid, concrete scene-based illustration for the hero image:";

        $prompt = trim((string) $nanoGpt->chat([
            ['role' => 'system', 'content' => $instructions],
            ['role' => 'user', 'content' => $user],
        ], ['temperature' => 0.75]));

        return $prompt !== '' ? $prompt : $topic;
    }

    /**
     * @param  array{slug?: string, title?: string, tags?: list<string>, scene_offset?: int}  $context
     * @return array{id: string, label: string, directive: string, keywords: list<string>}
     */
    public function resolveScene(string $topic, array $context = []): array
    {
        $tags = $context['tags'] ?? [];
        if (! is_array($tags)) {
            $tags = [];
        }

        return BlogHeroSceneVariety::selectScene(
            $topic,
            (string) ($context['slug'] ?? ''),
            (string) ($context['title'] ?? ''),
            array_values(array_filter($tags, static fn ($tag): bool => is_string($tag) && $tag !== '')),
            (int) ($context['scene_offset'] ?? 0),
        );
    }
}
