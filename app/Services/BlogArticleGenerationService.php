<?php

namespace App\Services;

use App\Support\BlogArticleFormats;
use App\Support\BlogKeywordStrategy;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class BlogArticleGenerationService
{
    public function __construct(private readonly NanoGptService $nanoGpt) {}

    /**
     * @param  array{key: string, name: string, hint: string, title_pattern: string}  $format
     * @param  (callable(string, array<string, mixed>): void)|null  $onProgress
     * @param  array{id?: string, primary: string, selected_supporting?: array<int, string>, supporting?: array<int, string>, angle_hints?: array<int, string>}|null  $seoTarget
     * @return array{title: string, excerpt: string, body: string, tags: array<int, string>, sources: array<int, mixed>}
     */
    public function generateFullArticle(
        string $topic,
        string $research,
        string $lengthKey,
        array $format = [],
        ?callable $onProgress = null,
        ?array $seoTarget = null,
    ): array {
        $sectionCount = BlogArticleFormats::sectionCountForLength($lengthKey);
        $wordRange = BlogArticleFormats::perSectionWordRange($lengthKey, $sectionCount);
        $wordGuidance = BlogArticleFormats::articleBodyWordGuidance($lengthKey);
        $seoBlock = $seoTarget !== null ? BlogKeywordStrategy::promptBlock($seoTarget) : '';

        $onProgress?->__invoke('planning_start', [
            'section_count' => $sectionCount,
            'words_per_section_min' => $wordRange['min'],
            'words_per_section_max' => $wordRange['max'],
        ]);

        $plan = $this->planArticle($topic, $research, $lengthKey, $wordGuidance, $sectionCount, $wordRange, $format, $seoBlock);

        $onProgress?->__invoke('plan_complete', [
            'title' => $plan['title'],
            'section_headings' => array_column($plan['sections'], 'heading'),
            'tag_count' => count($plan['tags']),
            'source_count' => count($plan['sources']),
        ]);

        $bodyParts = [];
        $previousNotes = [];

        foreach ($plan['sections'] as $index => $section) {
            $sectionNum = $index + 1;
            $heading = $section['heading'];
            $beats = $section['beats'];

            $onProgress?->__invoke('section_start', [
                'index' => $sectionNum,
                'total' => $sectionCount,
                'heading' => $heading,
            ]);

            $content = $this->writeSection(
                $topic,
                $research,
                $lengthKey,
                $sectionCount,
                $sectionNum,
                $heading,
                $beats,
                $wordRange,
                $previousNotes,
                $format,
                $seoBlock,
            );

            $contentTrimmed = trim($content);
            $contentTrimmed = self::stripLeadingDuplicateMarkdownHeadingsForSection($contentTrimmed, $heading);

            $onProgress?->__invoke('section_done', [
                'index' => $sectionNum,
                'total' => $sectionCount,
                'content_chars' => mb_strlen($contentTrimmed),
                'content_words_approx' => str_word_count(strip_tags($contentTrimmed)),
            ]);

            $bodyParts[] = '## '.$heading."\n\n".$contentTrimmed;
            $previousNotes[] = $heading.': '.mb_substr(trim(strip_tags($contentTrimmed)), 0, 280);
        }

        $body = self::normalizeBlogBodyForDisplay(implode("\n\n", $bodyParts), (string) $plan['title']);

        $onProgress?->__invoke('generation_complete', [
            'body_chars' => mb_strlen($body),
            'body_words_approx' => str_word_count(strip_tags($body)),
        ]);

        return [
            'title' => $plan['title'],
            'excerpt' => $plan['excerpt'],
            'body' => $body,
            'tags' => $plan['tags'],
            'sources' => $plan['sources'],
        ];
    }

    /**
     * @param  array{min: int, max: int}  $wordRange
     * @param  array{key: string, name: string, hint: string, title_pattern: string}  $format
     * @return array{title: string, excerpt: string, tags: array<int, string>, sources: array<int, mixed>, sections: array<int, array{heading: string, beats: string}>}
     */
    protected function planArticle(
        string $topic,
        string $research,
        string $lengthKey,
        string $wordGuidance,
        int $sectionCount,
        array $wordRange,
        array $format,
        string $seoBlock = '',
    ): array {
        $formatName = $format['name'] ?? 'Article';
        $formatHint = $format['hint'] ?? '';
        $maxAttempts = (int) config('blog.generate.max_attempts_per_step', 3);
        $lastException = null;

        $system = <<<PROMPT
You plan blog articles for AutoCVApply (autocvapply.com), a tool that helps UK job seekers autofill application forms.
Article format: {$formatName}. {$formatHint}
Return JSON only with keys: title, excerpt, tags (array of 3-6 lowercase strings), sources (array of objects with title, url, description), sections (array of exactly {$sectionCount} objects with heading and beats).
Optimise title, excerpt, and H2 headings for the SEO keyword target without stuffing.
Do not invent AutoCVApply features beyond the research brief. Do not promise interviews or offers.
For sources: only include URLs from the Web research (Firecrawl) section of the brief. Prefer 3-6 most relevant. Never invent or guess URLs. If no web research is present, return an empty sources array.
PROMPT;

        $seoSection = $seoBlock !== '' ? "\n\n{$seoBlock}\n" : "\n";

        $user = <<<PROMPT
Topic:
{$topic}
{$seoSection}
Research brief:
{$research}

Target length: {$wordGuidance} across exactly {$sectionCount} sections (~{$wordRange['min']}-{$wordRange['max']} words each).
PROMPT;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $decoded = $this->nanoGpt->chatJson([
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ], ['temperature' => 0.4]);

                if ($decoded === null) {
                    throw new \RuntimeException('Planning returned empty JSON.');
                }

                return self::normalizeArticlePlan($decoded, $topic, $sectionCount);
            } catch (\Throwable $e) {
                $lastException = $e;
                Log::warning('Blog article planning attempt failed.', [
                    'attempt' => $attempt,
                    'message' => $e->getMessage(),
                ]);

                if ($attempt < $maxAttempts) {
                    sleep($attempt * 2);
                }
            }
        }

        throw $lastException ?? new \RuntimeException('Article planning failed.');
    }

    /**
     * @param  array{min: int, max: int}  $wordRange
     * @param  array<int, string>  $previousNotes
     * @param  array{key: string, name: string, hint: string, title_pattern: string}  $format
     */
    protected function writeSection(
        string $topic,
        string $research,
        string $lengthKey,
        int $sectionCount,
        int $sectionIndex,
        string $heading,
        string $beats,
        array $wordRange,
        array $previousNotes,
        array $format,
        string $seoBlock = '',
    ): string {
        $wordGuidance = BlogArticleFormats::articleBodyWordGuidance($lengthKey);
        $formatName = $format['name'] ?? 'Article';
        $prior = $previousNotes === [] ? '(none yet)' : implode("\n", $previousNotes);
        $maxAttempts = (int) config('blog.generate.max_attempts_per_step', 3);
        $lastException = null;

        $system = <<<PROMPT
You write one section of a blog article for AutoCVApply ({$formatName}).
Write ONLY this section's Markdown body in JSON field "content".
Do NOT repeat the section heading as ## at the start. You may use ### subheadings with different wording.
UK job seekers audience. Practical, honest tone. ~{$wordRange['min']}-{$wordRange['max']} words for this section.
Use SEO keywords naturally where they fit this section; never keyword-stuff.
Do not invent product features beyond the research brief.
When the research brief includes Firecrawl web sources, ground non-product claims in those sources. Do not invent citations or URLs.
PROMPT;

        $seoSection = $seoBlock !== '' ? "\n{$seoBlock}\n" : "\n";

        $user = <<<PROMPT
Topic: {$topic}
{$seoSection}
Authoritative context:
{$research}

Section {$sectionIndex} of {$sectionCount}
Heading (context only): {$heading}
Beats: {$beats}
Overall article target: {$wordGuidance}
Already covered:
{$prior}
PROMPT;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $decoded = $this->nanoGpt->chatJson([
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ], ['temperature' => 0.5]);

                $content = is_array($decoded) ? ($decoded['content'] ?? null) : null;

                if (! is_string($content) || trim($content) === '') {
                    throw new \RuntimeException('Section writer returned empty content.');
                }

                return $content;
            } catch (\Throwable $e) {
                $lastException = $e;
                Log::warning('Blog section writing attempt failed.', [
                    'section_index' => $sectionIndex,
                    'attempt' => $attempt,
                    'message' => $e->getMessage(),
                ]);

                if ($attempt < $maxAttempts) {
                    sleep($attempt * 2);
                }
            }
        }

        throw $lastException ?? new \RuntimeException('Section writing failed.');
    }

    /**
     * @param  array<string, mixed>  $decoded
     * @return array{title: string, excerpt: string, tags: array<int, string>, sources: array<int, mixed>, sections: array<int, array{heading: string, beats: string}>}
     */
    public static function normalizeArticlePlan(array $decoded, string $topic, int $sectionCount): array
    {
        $title = trim((string) ($decoded['title'] ?? $topic));
        $excerpt = trim((string) ($decoded['excerpt'] ?? ''));
        if ($excerpt === '') {
            $excerpt = 'Practical advice for UK job seekers using AutoCVApply to autofill repetitive application forms.';
        }

        $tags = collect($decoded['tags'] ?? [])
            ->filter(fn (mixed $tag): bool => is_string($tag) && trim($tag) !== '')
            ->map(fn (string $tag): string => Str::lower(trim($tag)))
            ->values()
            ->all();

        $sources = collect($decoded['sources'] ?? [])
            ->filter(fn (mixed $source): bool => is_array($source))
            ->values()
            ->all();

        $sections = [];
        foreach ($decoded['sections'] ?? [] as $section) {
            if (! is_array($section)) {
                continue;
            }
            $heading = self::normalizePlanText($section['heading'] ?? '');
            $beats = self::normalizePlanText($section['beats'] ?? '');
            if ($heading === '' || $beats === '') {
                continue;
            }
            $sections[] = ['heading' => $heading, 'beats' => $beats];
        }

        while (count($sections) < $sectionCount) {
            $n = count($sections) + 1;
            $sections[] = [
                'heading' => "Section {$n}",
                'beats' => 'Expand on the topic with practical advice for job seekers.',
            ];
        }

        return [
            'title' => $title,
            'excerpt' => $excerpt,
            'tags' => $tags,
            'sources' => $sources,
            'sections' => array_slice($sections, 0, $sectionCount),
        ];
    }

    public static function normalizePlanText(mixed $value): string
    {
        if (is_string($value)) {
            return trim($value);
        }

        if (is_array($value)) {
            $parts = collect($value)
                ->map(fn (mixed $part): string => self::normalizePlanText($part))
                ->filter(fn (string $part): bool => $part !== '')
                ->values()
                ->all();

            return trim(implode(' ', $parts));
        }

        if (is_scalar($value)) {
            return trim((string) $value);
        }

        return '';
    }

    public static function normalizeBlogBodyForDisplay(string $body, string $pageTitle): string
    {
        $body = self::stripDuplicateLeadTitleFromBody($body, $pageTitle);

        return self::dedupeAdjacentDuplicateHeadingsInMarkdown($body);
    }

    public static function stripDuplicateLeadTitleFromBody(string $body, string $pageTitle): string
    {
        $lines = preg_split("/\r\n|\r|\n/", $body) ?: [];
        $i = 0;
        while ($i < count($lines) && trim($lines[$i]) === '') {
            $i++;
        }
        if ($i >= count($lines)) {
            return $body;
        }
        if (preg_match('/^#{1,6}\s+(.+)$/', trim($lines[$i]), $m)) {
            if (self::normalizeHeadingPlainText($m[1]) === self::normalizeHeadingPlainText($pageTitle)) {
                array_splice($lines, $i, 1);
                while ($i < count($lines) && trim($lines[$i]) === '') {
                    array_splice($lines, $i, 1);
                }
            }
        }

        return implode("\n", $lines);
    }

    public static function dedupeAdjacentDuplicateHeadingsInMarkdown(string $markdown): string
    {
        $lines = preg_split("/\r\n|\r|\n/", $markdown) ?: [];
        $out = [];
        $lastHeadingKey = null;

        foreach ($lines as $line) {
            $trim = trim($line);
            if ($trim === '') {
                $out[] = $line;

                continue;
            }
            if (preg_match('/^(#{2,3})\s+(.+)$/', $trim, $m)) {
                $key = strlen($m[1]).':'.self::normalizeHeadingPlainText($m[2]);
                if ($key === $lastHeadingKey) {
                    continue;
                }
                $lastHeadingKey = $key;
                $out[] = $line;

                continue;
            }

            $lastHeadingKey = null;
            $out[] = $line;
        }

        return implode("\n", $out);
    }

    public static function stripLeadingDuplicateMarkdownHeadingsForSection(string $content, string $heading): string
    {
        $lines = preg_split("/\r\n|\r|\n/", trim($content)) ?: [];
        if ($lines === []) {
            return $content;
        }
        if (preg_match('/^#{1,6}\s+(.+)$/', trim($lines[0]), $m)) {
            if (self::normalizeHeadingPlainText($m[1]) === self::normalizeHeadingPlainText($heading)) {
                array_shift($lines);
                while ($lines !== [] && trim($lines[0]) === '') {
                    array_shift($lines);
                }
            }
        }

        return implode("\n", $lines);
    }

    public static function normalizeHeadingPlainText(string $text): string
    {
        return Str::lower(trim(preg_replace('/\s+/', ' ', $text) ?? $text));
    }
}
