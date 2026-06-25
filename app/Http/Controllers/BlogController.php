<?php

namespace App\Http\Controllers;

use App\Models\Blog;
use App\Services\BlogArticleGenerationService;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class BlogController extends Controller
{
    public function index(): Response
    {
        $posts = Blog::published()
            ->select(['id', 'title', 'slug', 'excerpt', 'image_url', 'tags', 'published_at', 'view_count'])
            ->orderByDesc('published_at')
            ->paginate(12);

        return Inertia::render('Blog/Index', [
            'posts' => $posts,
        ]);
    }

    public function show(Blog $blog): Response
    {
        abort_unless($blog->status->value === 'published' && $blog->published_at?->isPast(), 404);

        $blog->increment('view_count');

        $postUrl = route('blog.show', $blog, absolute: true);
        $body = BlogArticleGenerationService::normalizeBlogBodyForDisplay(
            (string) $blog->body,
            (string) $blog->title,
        );

        return Inertia::render('Blog/Show', [
            'post' => [
                'id' => $blog->id,
                'title' => $blog->title,
                'slug' => $blog->slug,
                'excerpt' => $blog->excerpt,
                'body_html' => Str::markdown($body),
                'image_url' => $blog->image_url,
                'tags' => $blog->tags ?? [],
                'sources' => $blog->sources ?? [],
                'published_at' => $blog->published_at?->toIso8601String(),
                'view_count' => $blog->view_count,
                'url' => $postUrl,
            ],
            'more_posts' => $this->morePostsForArticle($blog),
            'share_links' => $this->shareLinks($postUrl, $blog->title, $blog->excerpt),
        ]);
    }

    /**
     * @return array<string, string>
     */
    protected function shareLinks(string $url, string $title, string $excerpt): array
    {
        $encodedUrl = rawurlencode($url);
        $encodedTitle = rawurlencode($title);
        $encodedText = rawurlencode($title.' '.$url);

        return [
            'facebook' => "https://www.facebook.com/sharer/sharer.php?u={$encodedUrl}",
            'twitter' => "https://twitter.com/intent/tweet?url={$encodedUrl}&text={$encodedTitle}",
            'linkedin' => "https://www.linkedin.com/sharing/share-offsite/?url={$encodedUrl}",
            'whatsapp' => "https://wa.me/?text={$encodedText}",
        ];
    }

    /**
     * @return Collection<int, Blog>
     */
    protected function morePostsForArticle(Blog $blog): Collection
    {
        $columns = ['id', 'title', 'slug', 'excerpt', 'image_url', 'tags', 'published_at', 'view_count'];

        $candidates = Blog::query()
            ->published()
            ->where('id', '!=', $blog->id)
            ->orderByDesc('published_at')
            ->limit(50)
            ->get($columns);

        if ($candidates->isEmpty()) {
            return collect();
        }

        $take = min(3, $candidates->count());
        $currentTags = array_values(array_unique(array_filter($blog->tags ?? [])));

        if ($currentTags === []) {
            return $candidates->random($take)->values();
        }

        $scored = $candidates->map(fn (Blog $post): array => [
            'post' => $post,
            'overlap' => count(array_intersect($currentTags, $post->tags ?? [])),
        ]);

        if ((int) $scored->max('overlap') === 0) {
            return $candidates->random($take)->values();
        }

        $tagMatches = $scored
            ->filter(fn (array $row): bool => $row['overlap'] > 0)
            ->sort(function (array $a, array $b): int {
                if ($a['overlap'] !== $b['overlap']) {
                    return $b['overlap'] <=> $a['overlap'];
                }

                return $b['post']->published_at <=> $a['post']->published_at;
            })
            ->pluck('post')
            ->take(3);

        if ($tagMatches->count() >= $take) {
            return $tagMatches->values();
        }

        $pickedIds = $tagMatches->pluck('id')->all();
        $remaining = $candidates->whereNotIn('id', $pickedIds)->values();
        $need = $take - $tagMatches->count();

        return $tagMatches->concat($remaining->random(min($need, $remaining->count())))->values();
    }
}
