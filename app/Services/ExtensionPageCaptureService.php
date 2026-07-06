<?php

namespace App\Services;

use App\Enums\SubscriptionTier;
use App\Models\ExtensionPageCapture;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class ExtensionPageCaptureService
{
    public function __construct(
        private readonly ExtensionPageCaptureRedactionService $redaction,
    ) {}

    public function store(User $user, string $url, string $pageTitle, string $html): ExtensionPageCapture
    {
        $domain = $this->extractDomain($url);

        return ExtensionPageCapture::query()->create([
            'user_id' => $user->id,
            'url' => $url,
            'page_title' => $pageTitle,
            'domain' => $domain,
            'platform' => $this->detectPlatform($domain),
            'html' => $this->redaction->redactForUser($user, $html),
        ]);
    }

    /**
     * @param  array<string, mixed>  $queryAppends
     * @return array<string, mixed>
     */
    public function adminDashboardData(array $queryAppends = []): array
    {
        $chartDays = max(7, min(90, (int) config('admin.dashboard_chart_days', 30)));
        $start = now()->subDays($chartDays - 1)->startOfDay();

        $countsByDate = ExtensionPageCapture::query()
            ->where('created_at', '>=', $start)
            ->selectRaw('DATE(created_at) as capture_date, COUNT(*) as total')
            ->groupBy('capture_date')
            ->pluck('total', 'capture_date')
            ->all();

        $series = [];
        $periodTotal = 0;

        for ($offset = 0; $offset < $chartDays; $offset++) {
            $date = $start->copy()->addDays($offset)->toDateString();
            $count = (int) ($countsByDate[$date] ?? 0);
            $periodTotal += $count;

            $series[] = [
                'date' => $date,
                'count' => $count,
            ];
        }

        return [
            'stats' => [
                'total_captures' => (int) ExtensionPageCapture::query()->count(),
                'period_captures' => $periodTotal,
                'unique_domains' => (int) ExtensionPageCapture::query()->distinct('domain')->count('domain'),
                'active_extension_users' => (int) ExtensionPageCapture::query()
                    ->where('created_at', '>=', $start)
                    ->distinct('user_id')
                    ->count('user_id'),
                'captures_today' => (int) ExtensionPageCapture::query()
                    ->whereDate('created_at', now()->toDateString())
                    ->count(),
            ],
            'capture_series' => [
                'days' => $chartDays,
                'series' => $series,
            ],
            'captures' => $this->paginatedCaptures($queryAppends),
            'recent_signups' => $this->recentSignups(),
            'plan_stats' => $this->planStats(),
            'plans' => SubscriptionTier::marketingPlans(),
        ];
    }

    /**
     * @param  array<string, mixed>  $queryAppends
     * @return LengthAwarePaginator<int, ExtensionPageCapture>
     */
    public function paginatedCaptures(array $queryAppends = []): LengthAwarePaginator
    {
        return ExtensionPageCapture::query()
            ->with('user:id,name,email')
            ->latest()
            ->paginate(
                (int) config('admin.page_captures_per_page', 25),
                ['*'],
                'captures_page',
            )
            ->appends($queryAppends)
            ->through(fn (ExtensionPageCapture $capture): array => $capture->toAdminArray());
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function recentSignups(): array
    {
        return User::query()
            ->latest()
            ->limit((int) config('admin.recent_signups_limit', 15))
            ->get(['id', 'name', 'email', 'subscription_tier', 'created_at'])
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'subscription_tier' => $user->subscriptionTier()->label(),
                'created_at' => $user->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function planStats(): array
    {
        $countsByTier = User::query()
            ->select('subscription_tier', DB::raw('COUNT(*) as total'))
            ->groupBy('subscription_tier')
            ->pluck('total', 'subscription_tier')
            ->all();

        return array_map(function (array $plan) use ($countsByTier): array {
            return [
                ...$plan,
                'user_count' => (int) ($countsByTier[$plan['key']] ?? 0),
            ];
        }, SubscriptionTier::marketingPlans());
    }

    public function extractDomain(string $url): string
    {
        $host = parse_url($url, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return '';
        }

        return strtolower(preg_replace('/^www\./', '', $host) ?? $host);
    }

    public function detectPlatform(string $domain): ?string
    {
        return match (true) {
            str_contains($domain, 'greenhouse.io') => 'greenhouse',
            str_contains($domain, 'lever.co') => 'lever',
            str_contains($domain, 'myworkdayjobs.com') => 'workday',
            str_contains($domain, 'smartrecruiters.com') => 'smartrecruiters',
            str_contains($domain, 'ashbyhq.com') => 'ashby',
            str_contains($domain, 'teamtailor.com') => 'teamtailor',
            str_contains($domain, 'indeed.com') => 'indeed',
            str_contains($domain, 'linkedin.com') => 'linkedin',
            default => null,
        };
    }
}
