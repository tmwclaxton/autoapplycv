<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;
use Illuminate\Support\Str;
use Throwable;

/**
 * Converts blog markdown to safe HTML for the public article page.
 *
 * Authors / importers may include:
 * - Markdown images: ![Alt text](https://example.com/image.jpg)
 * - Figures: <figure><img src="..." alt="..."><figcaption>Caption</figcaption></figure>
 * - Tables (GFM pipe tables)
 * - YouTube / Vimeo embeds as raw iframe HTML from allowlisted hosts
 * - Standalone YouTube / Vimeo URLs on their own line (converted to embeds)
 *
 * Scripts, event handlers, and non-allowlisted iframes are removed.
 */
class BlogMarkdownRenderer
{
    /**
     * @var list<string>
     */
    private const ALLOWED_TAGS = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'strong', 'em', 'b', 'i', 'u', 's', 'del',
        'a', 'img', 'figure', 'figcaption',
        'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'div', 'iframe',
    ];

    /**
     * Placeholder token used while CommonMark escapes disallowed raw iframes.
     */
    private const EMBED_PLACEHOLDER_PREFIX = 'POSTBOXEMBED';

    public static function toHtml(string $markdown): string
    {
        $markdown = self::promoteStandaloneVideoUrls($markdown);
        [$markdown, $embeds] = self::extractAllowlistedEmbeds($markdown);

        $html = Str::markdown($markdown, [
            'html_input' => 'allow',
            'allow_unsafe_links' => false,
        ]);

        $html = self::restoreEmbedPlaceholders($html, $embeds);

        return self::sanitizeAndEnhance($html);
    }

    /**
     * Pull allowlisted iframe HTML out before markdown so CommonMark cannot escape it.
     *
     * @return array{0: string, 1: list<string>}
     */
    private static function extractAllowlistedEmbeds(string $markdown): array
    {
        $embeds = [];

        $markdown = (string) preg_replace_callback(
            '/<iframe\b[^>]*>\s*<\/iframe>/is',
            function (array $matches) use (&$embeds): string {
                $iframeHtml = $matches[0];
                $src = self::attributeValue($iframeHtml, 'src');

                if ($src === null || ! self::isAllowlistedEmbedUrl($src)) {
                    return '';
                }

                $index = count($embeds);
                $embeds[] = self::buildSafeIframeHtml($src, self::attributeValue($iframeHtml, 'title'));

                return "\n\n".self::EMBED_PLACEHOLDER_PREFIX.$index."\n\n";
            },
            $markdown,
        );

        return [$markdown, $embeds];
    }

    /**
     * Turn lone YouTube / Vimeo URLs into embed placeholders.
     */
    private static function promoteStandaloneVideoUrls(string $markdown): string
    {
        return (string) preg_replace_callback(
            '/^(?:<p>)?(https?:\/\/(?:(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s<]+|youtu\.be\/[^\s<]+|(?:www\.)?youtube\.com\/embed\/[^\s<]+|player\.vimeo\.com\/video\/[^\s<]+|vimeo\.com\/\d+[^\s<]*))(?:<\/p>)?\s*$/im',
            function (array $matches): string {
                $url = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5);
                $embedSrc = self::normalizeEmbedSrc($url);

                if ($embedSrc === null) {
                    return $matches[0];
                }

                return '<iframe src="'.e($embedSrc).'" title="Embedded video" loading="lazy" allowfullscreen></iframe>';
            },
            $markdown,
        );
    }

    /**
     * @param  list<string>  $embeds
     */
    private static function restoreEmbedPlaceholders(string $html, array $embeds): string
    {
        foreach ($embeds as $index => $embedHtml) {
            $token = self::EMBED_PLACEHOLDER_PREFIX.$index;
            $wrapped = '<div class="postbox-embed">'.$embedHtml.'</div>';
            $html = str_replace(
                ['<p>'.$token.'</p>', $token],
                [$wrapped, $wrapped],
                $html,
            );
        }

        return $html;
    }

    private static function sanitizeAndEnhance(string $html): string
    {
        if (trim($html) === '') {
            return '';
        }

        $document = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);

        try {
            $document->loadHTML(
                '<?xml encoding="UTF-8"><div id="postbox-root">'.$html.'</div>',
                LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
            );
        } catch (Throwable) {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);

            return '';
        }

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $document->getElementById('postbox-root');

        if (! $root instanceof DOMElement) {
            return '';
        }

        self::sanitizeNode($document, $root);
        self::enhanceMedia($document, $root);

        $output = '';

        foreach (iterator_to_array($root->childNodes) as $child) {
            $output .= $document->saveHTML($child);
        }

        return $output;
    }

    private static function sanitizeNode(DOMDocument $document, DOMNode $node): void
    {
        /** @var list<DOMNode> $children */
        $children = iterator_to_array($node->childNodes);

        foreach ($children as $child) {
            if ($child instanceof DOMElement) {
                $tag = strtolower($child->tagName);

                if (! in_array($tag, self::ALLOWED_TAGS, true)) {
                    while ($child->firstChild) {
                        $node->insertBefore($child->firstChild, $child);
                    }
                    $node->removeChild($child);

                    continue;
                }

                self::sanitizeAttributes($child, $tag);

                if ($tag === 'iframe' && ! self::isSafeIframeElement($child)) {
                    $node->removeChild($child);

                    continue;
                }

                if ($tag === 'a' && ! self::isSafeHref($child->getAttribute('href'))) {
                    self::unwrapElement($child);

                    continue;
                }

                if ($tag === 'img' && ! self::isSafeMediaUrl($child->getAttribute('src'))) {
                    $node->removeChild($child);

                    continue;
                }

                if ($tag === 'div' && ! self::isSafeDiv($child)) {
                    self::unwrapElement($child);

                    continue;
                }

                self::sanitizeNode($document, $child);
            } elseif ($child->nodeType === XML_COMMENT_NODE) {
                $node->removeChild($child);
            }
        }
    }

    private static function sanitizeAttributes(DOMElement $element, string $tag): void
    {
        /** @var list<string> $names */
        $names = [];

        if ($element->hasAttributes()) {
            foreach ($element->attributes as $attribute) {
                $names[] = $attribute->name;
            }
        }

        foreach ($names as $name) {
            $lower = strtolower($name);

            if (str_starts_with($lower, 'on') || $lower === 'style' || $lower === 'srcdoc') {
                $element->removeAttribute($name);

                continue;
            }

            $allowed = match ($tag) {
                'a' => in_array($lower, ['href', 'title', 'rel', 'target'], true),
                'img' => in_array($lower, ['src', 'alt', 'title', 'width', 'height', 'loading'], true),
                'iframe' => in_array($lower, ['src', 'title', 'allow', 'allowfullscreen', 'frameborder', 'loading', 'referrerpolicy'], true),
                'td', 'th' => in_array($lower, ['colspan', 'rowspan', 'align'], true),
                'div' => $lower === 'class',
                'code' => $lower === 'class',
                'pre' => $lower === 'class',
                default => false,
            };

            if (! $allowed) {
                $element->removeAttribute($name);
            }
        }

        if ($tag === 'a') {
            $element->setAttribute('rel', 'noopener noreferrer');

            if ($element->getAttribute('target') === '_blank') {
                // keep
            } elseif ($element->hasAttribute('target')) {
                $element->removeAttribute('target');
            }
        }

        if ($tag === 'img' && ! $element->hasAttribute('loading')) {
            $element->setAttribute('loading', 'lazy');
        }

        if ($tag === 'iframe') {
            $element->setAttribute('loading', 'lazy');
            $element->setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            $element->setAttribute('allowfullscreen', 'allowfullscreen');
            $element->setAttribute(
                'allow',
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            );
        }

        if (in_array($tag, ['div', 'code', 'pre'], true) && $element->hasAttribute('class')) {
            $safeClasses = self::filterSafeClasses($element->getAttribute('class'), $tag);

            if ($safeClasses === []) {
                $element->removeAttribute('class');
            } else {
                $element->setAttribute('class', implode(' ', $safeClasses));
            }
        }
    }

    private static function enhanceMedia(DOMDocument $document, DOMElement $root): void
    {
        /** @var list<DOMElement> $tables */
        $tables = [];
        /** @var list<DOMElement> $iframes */
        $iframes = [];

        foreach ($root->getElementsByTagName('table') as $table) {
            if ($table instanceof DOMElement) {
                $tables[] = $table;
            }
        }

        foreach ($tables as $table) {
            $parent = $table->parentNode;

            if (! $parent instanceof DOMElement) {
                continue;
            }

            if (
                $parent->tagName === 'div'
                && str_contains($parent->getAttribute('class'), 'postbox-table-wrap')
            ) {
                continue;
            }

            $wrap = $document->createElement('div');
            $wrap->setAttribute('class', 'postbox-table-wrap');
            $parent->insertBefore($wrap, $table);
            $wrap->appendChild($table);
        }

        foreach ($root->getElementsByTagName('iframe') as $iframe) {
            if ($iframe instanceof DOMElement) {
                $iframes[] = $iframe;
            }
        }

        foreach ($iframes as $iframe) {
            $parent = $iframe->parentNode;

            if (! $parent instanceof DOMElement) {
                continue;
            }

            if (
                $parent->tagName === 'div'
                && str_contains($parent->getAttribute('class'), 'postbox-embed')
            ) {
                continue;
            }

            if ($parent->tagName === 'p' && $parent->childNodes->length === 1) {
                $grandParent = $parent->parentNode;

                if ($grandParent instanceof DOMNode) {
                    $wrap = $document->createElement('div');
                    $wrap->setAttribute('class', 'postbox-embed');
                    $grandParent->insertBefore($wrap, $parent);
                    $wrap->appendChild($iframe);
                    $grandParent->removeChild($parent);

                    continue;
                }
            }

            $wrap = $document->createElement('div');
            $wrap->setAttribute('class', 'postbox-embed');
            $parent->insertBefore($wrap, $iframe);
            $wrap->appendChild($iframe);
        }

        foreach ($root->getElementsByTagName('img') as $img) {
            if (! $img instanceof DOMElement) {
                continue;
            }

            if (! $img->hasAttribute('alt')) {
                $img->setAttribute('alt', '');
            }
        }
    }

    private static function unwrapElement(DOMElement $element): void
    {
        $parent = $element->parentNode;

        if (! $parent instanceof DOMNode) {
            return;
        }

        while ($element->firstChild) {
            $parent->insertBefore($element->firstChild, $element);
        }

        $parent->removeChild($element);
    }

    private static function isSafeIframeElement(DOMElement $iframe): bool
    {
        return self::isAllowlistedEmbedUrl($iframe->getAttribute('src'));
    }

    private static function isSafeDiv(DOMElement $div): bool
    {
        $classes = self::filterSafeClasses($div->getAttribute('class'), 'div');

        return $classes !== [];
    }

    /**
     * @return list<string>
     */
    private static function filterSafeClasses(string $classAttr, string $tag): array
    {
        $allowed = [];

        foreach (preg_split('/\s+/', trim($classAttr)) ?: [] as $class) {
            if ($class === '') {
                continue;
            }

            if ($tag === 'div' && in_array($class, ['postbox-table-wrap', 'postbox-embed'], true)) {
                $allowed[] = $class;
            }

            if (in_array($tag, ['code', 'pre'], true) && preg_match('/^(language|lang)-[\w-]+$/', $class) === 1) {
                $allowed[] = $class;
            }
        }

        return array_values(array_unique($allowed));
    }

    private static function isSafeHref(string $href): bool
    {
        $href = trim(html_entity_decode($href, ENT_QUOTES | ENT_HTML5));

        if ($href === '' || str_starts_with($href, '#')) {
            return true;
        }

        if (preg_match('/^(https?:|mailto:)/i', $href) !== 1) {
            return false;
        }

        return ! preg_match('/^\s*javascript:/i', $href);
    }

    private static function isSafeMediaUrl(string $url): bool
    {
        $url = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5));

        return preg_match('/^https?:\/\//i', $url) === 1;
    }

    private static function isAllowlistedEmbedUrl(string $url): bool
    {
        return self::normalizeEmbedSrc($url) !== null;
    }

    private static function normalizeEmbedSrc(string $url): ?string
    {
        $url = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5));

        if ($url === '' || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($url);

        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https') {
            return null;
        }

        $host = strtolower($parts['host'] ?? '');
        $path = $parts['path'] ?? '';
        $query = [];

        if (isset($parts['query'])) {
            parse_str($parts['query'], $query);
        }

        /** @var list<string> $hosts */
        $hosts = config('blog.embed_hosts', [
            'www.youtube.com',
            'youtube.com',
            'www.youtube-nocookie.com',
            'youtube-nocookie.com',
            'youtu.be',
            'player.vimeo.com',
            'vimeo.com',
        ]);

        if (! in_array($host, $hosts, true)) {
            return null;
        }

        if ($host === 'youtu.be') {
            $id = trim($path, '/');

            if ($id === '' || preg_match('/^[A-Za-z0-9_-]{6,}$/', $id) !== 1) {
                return null;
            }

            return 'https://www.youtube-nocookie.com/embed/'.$id;
        }

        if (in_array($host, ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'], true)) {
            if (str_starts_with($path, '/embed/')) {
                $id = trim(substr($path, strlen('/embed/')), '/');
            } elseif ($path === '/watch' && isset($query['v']) && is_string($query['v'])) {
                $id = $query['v'];
            } else {
                return null;
            }

            if (preg_match('/^[A-Za-z0-9_-]{6,}$/', $id) !== 1) {
                return null;
            }

            return 'https://www.youtube-nocookie.com/embed/'.$id;
        }

        if ($host === 'vimeo.com') {
            if (preg_match('#^/(\d+)#', $path, $matches) !== 1) {
                return null;
            }

            return 'https://player.vimeo.com/video/'.$matches[1];
        }

        if ($host === 'player.vimeo.com') {
            if (preg_match('#^/video/(\d+)#', $path, $matches) !== 1) {
                return null;
            }

            return 'https://player.vimeo.com/video/'.$matches[1];
        }

        return null;
    }

    private static function buildSafeIframeHtml(string $src, ?string $title): string
    {
        $embedSrc = self::normalizeEmbedSrc($src) ?? $src;
        $safeTitle = trim((string) $title);

        if ($safeTitle === '') {
            $safeTitle = 'Embedded video';
        }

        return '<iframe src="'.e($embedSrc).'" title="'.e($safeTitle).'" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe>';
    }

    private static function attributeValue(string $html, string $name): ?string
    {
        if (preg_match('/\b'.preg_quote($name, '/').'\s*=\s*(["\'])(.*?)\1/i', $html, $matches) !== 1) {
            return null;
        }

        return html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5);
    }
}
