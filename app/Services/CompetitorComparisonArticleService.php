<?php

namespace App\Services;

use App\Support\AutoCVApplyBlogContext;
use App\Support\BlogCompetitorComparisons;
use App\Support\BlogTldrPlacement;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Builds AutoCVApply vs competitor comparison article bodies.
 *
 * Default path: curated crawl-backed markdown from BlogCompetitorComparisons.
 * Optional --ai path: NanoGPT rewrite fed by Firecrawl research + product context.
 */
class CompetitorComparisonArticleService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
        private readonly CompetitorComparisonResearchService $research,
    ) {}

    /**
     * @param  array<string, mixed>  $definition
     * @return array{title: string, slug: string, excerpt: string, body: string, tags: array<int, string>, sources: array<int, array{title: string, url: string, description: string}>}
     */
    public function buildPost(array $definition, bool $useAi = false, bool $refreshResearch = false): array
    {
        $base = BlogCompetitorComparisons::toPost($definition);
        $sources = $this->defaultSources($definition);

        if (! $useAi) {
            return [
                ...$base,
                'sources' => $sources,
            ];
        }

        try {
            $brief = $refreshResearch
                ? $this->research->research($definition)
                : [
                    'brief_markdown' => $this->research->formatBrief($definition, []),
                    'pages' => [],
                ];

            $aiBody = $this->generateBodyWithNanoGpt($definition, (string) $brief['brief_markdown']);
            if ($aiBody !== null && $this->bodyPassesValidation($definition, $aiBody)) {
                $base['body'] = $aiBody;
                foreach ($brief['pages'] ?? [] as $page) {
                    if (! ($page['ok'] ?? false)) {
                        continue;
                    }
                    $sources[] = [
                        'title' => $definition['competitor'].' - '.($page['title'] ?: 'page'),
                        'url' => $page['url'],
                        'description' => 'Firecrawl scrape used for comparison research.',
                    ];
                }
            } else {
                Log::warning('Competitor comparison AI body failed validation; using curated body.', [
                    'id' => $definition['id'] ?? null,
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('Competitor comparison AI generation failed; using curated body.', [
                'id' => $definition['id'] ?? null,
                'message' => $e->getMessage(),
            ]);
        }

        return [
            ...$base,
            'sources' => $this->uniqueSources($sources),
        ];
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    public function generateBodyWithNanoGpt(array $definition, string $researchBrief): ?string
    {
        $site = AutoCVApplyBlogContext::siteUrl();
        $store = (string) config(
            'blog.sources.official_chrome_web_store_url',
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        );
        $competitor = (string) $definition['competitor'];
        $homepage = (string) $definition['homepage_url'];

        $system = <<<PROMPT
You write honest SEO comparison articles for AutoCVApply (UK job seekers).

Rules:
- Output markdown ONLY for the article body (no title).
- Include real markdown links: competitor homepage {$homepage}, and when known their pricing/features URLs from the brief.
- Always link AutoCVApply pages: {$site}, {$site}/pricing, {$site}/login, {$site}/how-to, {$site}/blog/what-is-autocvapply, Chrome Web Store {$store}.
- Required H2 sections (exact headings, in this order):
  ## Who each product is for
  ## How to compare Autofill and Auto Apply tools
  ## AutoCVApply vs {$competitor}: the practical angle
  ## When AutoCVApply is the better choice
  ## When {$competitor} might still fit
  ## Pricing posture
  ## TL;DR
  ## FAQ
  ## Get started
- Put ## TL;DR after the main comparison sections and immediately before ## FAQ.
- Under the practical angle section include ### Feature matrix (honest, link-backed) and ### Automation and privacy model and ### What crawl research found about {$competitor}.
- Feature matrix cells MUST answer with a short decisive lead-in: Yes / No / Partial / Unclear, then one honest clause grounded in the brief. Example: "Partial - markets LinkedIn and Indeed; not Totaljobs or Reed".
- Do NOT use hedge cop-outs in matrix cells such as "See their site", "Varies - see crawl notes", "verify on ...", or "Not claimed as this exact UK set".
- If unknown, write "Unclear - appears X from public pages" (still a real answer), never deflect to notes.
- Ground competitor claims ONLY in the research brief. If a scrape failed, say so. Never invent prices, board lists, or guarantees.
- AutoCVApply facts MUST match the AutoCVApply product truth in the brief (boards, ATS submit honesty, GBP pricing).
- Soft CTA only. No em dashes. No "guarantee more interviews".
- FAQ must include: Does AutoCVApply guarantee more interviews?
- Be specific and practical; avoid empty adjectives.
PROMPT;

        $user = "Write the comparison body for AutoCVApply vs {$competitor}.\n\nAngle: {$definition['angle']}\nWhen them: {$definition['when_them']}\n\n{$researchBrief}";

        $raw = $this->nanoGpt->chat([
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ], [
            'temperature' => 0.35,
            'timeout' => (int) config('blog.comparisons.ai_timeout', 120),
        ]);

        if (! is_string($raw) || trim($raw) === '') {
            return null;
        }

        $body = trim($raw);
        $body = preg_replace('/\A#\s+[^\n]+\n+/u', '', $body) ?? $body;
        $body = Str::of($body)->replace("\u{2014}", '-')->replace("\u{2013}", '-')->toString();

        return BlogTldrPlacement::moveNearBottom($body);
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    public function bodyPassesValidation(array $definition, string $body): bool
    {
        $competitor = (string) $definition['competitor'];
        $homepage = (string) $definition['homepage_url'];

        foreach (BlogCompetitorComparisons::requiredBodyMarkers($competitor) as $marker) {
            if (! str_contains($body, $marker)) {
                return false;
            }
        }

        if (! str_contains($body, $homepage)) {
            return false;
        }

        if (str_contains($body, 'http://localhost') || str_contains($body, 'https://localhost')) {
            return false;
        }

        $matrixSection = BlogCompetitorComparisons::extractFeatureMatrixSection($body);
        if ($matrixSection === '') {
            return false;
        }

        foreach (BlogCompetitorComparisons::bannedMatrixHedgePhrases() as $phrase) {
            if (str_contains($matrixSection, $phrase)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public function defaultSources(array $definition): array
    {
        $site = AutoCVApplyBlogContext::siteUrl();
        $sources = [
            [
                'title' => 'AutoCVApply',
                'url' => $site,
                'description' => 'Official product site.',
            ],
            [
                'title' => 'AutoCVApply pricing',
                'url' => $site.'/pricing',
                'description' => 'Current plan and credit allowances.',
            ],
            [
                'title' => (string) $definition['competitor'],
                'url' => (string) $definition['homepage_url'],
                'description' => 'Competitor homepage referenced in this comparison.',
            ],
        ];

        foreach (['pricing_url', 'features_url'] as $key) {
            $url = $definition[$key] ?? null;
            if (! is_string($url) || trim($url) === '') {
                continue;
            }
            $sources[] = [
                'title' => $definition['competitor'].' '.str_replace('_url', '', $key),
                'url' => trim($url),
                'description' => 'Competitor page referenced in this comparison.',
            ];
        }

        return $this->uniqueSources($sources);
    }

    /**
     * @param  array<int, array{title: string, url: string, description: string}>  $sources
     * @return array<int, array{title: string, url: string, description: string}>
     */
    protected function uniqueSources(array $sources): array
    {
        $seen = [];
        $out = [];
        foreach ($sources as $source) {
            $url = $source['url'];
            if (isset($seen[$url])) {
                continue;
            }
            $seen[$url] = true;
            $out[] = $source;
        }

        return $out;
    }
}
