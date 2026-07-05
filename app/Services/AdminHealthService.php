<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schema;
use Throwable;

class AdminHealthService
{
    public function __construct(
        private readonly WorkerHeartbeatService $workerHeartbeat,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function adminDashboardData(): array
    {
        return [
            'health' => [
                'checked_at' => now()->toIso8601String(),
                'database' => $this->databaseCheck(),
                'redis' => $this->redisCheck(),
                'workers' => $this->workersCheck(),
                'log_entries' => $this->recentLogEntries(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function databaseCheck(): array
    {
        $connection = (string) config('database.default', 'sqlite');
        $driver = (string) config("database.connections.{$connection}.driver", 'unknown');

        try {
            DB::connection()->select('select 1 as ok');

            $migrationCount = Schema::hasTable('migrations')
                ? (int) DB::table('migrations')->count()
                : null;

            return [
                'status' => 'ok',
                'message' => 'Database connection is healthy.',
                'connection' => $connection,
                'driver' => $driver,
                'migrations_applied' => $migrationCount,
            ];
        } catch (Throwable $exception) {
            return [
                'status' => 'error',
                'message' => 'Database connection failed.',
                'connection' => $connection,
                'driver' => $driver,
                'error' => $this->truncate($exception->getMessage(), 240),
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function redisCheck(): array
    {
        $usesRedis = $this->applicationUsesRedis();
        $connection = (string) config('database.redis.client', 'phpredis');

        if (! $usesRedis) {
            return [
                'status' => 'warning',
                'message' => 'Redis is not configured as the cache, queue, or session driver.',
                'configured' => false,
                'client' => $connection,
            ];
        }

        try {
            $pong = Redis::connection()->ping();
            $response = is_string($pong) ? $pong : (string) $pong;

            return [
                'status' => 'ok',
                'message' => 'Redis responded to ping.',
                'configured' => true,
                'client' => $connection,
                'response' => $this->truncate($response, 32),
            ];
        } catch (Throwable $exception) {
            return [
                'status' => 'error',
                'message' => 'Redis ping failed.',
                'configured' => true,
                'client' => $connection,
                'error' => $this->truncate($exception->getMessage(), 240),
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function workersCheck(): array
    {
        $connection = (string) config('queue.default', 'sync');
        $driver = (string) config("queue.connections.{$connection}.driver", $connection);
        $heartbeatStaleMinutes = max(1, (int) config('admin.worker_heartbeat_stale_minutes', 5));
        $pendingJobStaleMinutes = max(1, (int) config('admin.worker_pending_job_stale_minutes', 10));

        if ($driver === 'sync') {
            return [
                'status' => 'warning',
                'message' => 'Queue runs inline (sync). No background workers are required.',
                'connection' => $connection,
                'driver' => $driver,
                'pending_jobs' => null,
                'failed_jobs' => null,
                'last_worker_activity_at' => null,
                'last_worker_activity_minutes_ago' => null,
                'heartbeat_status' => null,
                'oldest_pending_job_at' => null,
                'oldest_pending_job_minutes' => null,
                'note' => 'Background worker heartbeats are not used when the sync queue driver is active.',
            ];
        }

        $pendingJobs = null;
        $failedJobs = null;
        $oldestPendingJobAt = null;
        $oldestPendingJobMinutes = null;

        try {
            if ($driver === 'database' && Schema::hasTable('jobs')) {
                $pendingJobs = (int) DB::table('jobs')->count();

                if ($pendingJobs > 0) {
                    $oldestPendingJob = DB::table('jobs')
                        ->orderBy('available_at')
                        ->first(['available_at', 'created_at']);

                    if ($oldestPendingJob !== null) {
                        $oldestTimestamp = min(
                            (int) $oldestPendingJob->available_at,
                            (int) $oldestPendingJob->created_at,
                        );
                        $oldestPendingJobAt = Carbon::createFromTimestamp($oldestTimestamp);
                        $oldestPendingJobMinutes = (int) $oldestPendingJobAt->diffInMinutes(now());
                    }
                }
            } elseif ($driver === 'redis') {
                $pendingJobs = Queue::connection($connection)->size();
            }

            if (Schema::hasTable('failed_jobs')) {
                $failedJobs = (int) DB::table('failed_jobs')->count();
            }
        } catch (Throwable $exception) {
            return [
                'status' => 'error',
                'message' => 'Queue health check failed.',
                'connection' => $connection,
                'driver' => $driver,
                'error' => $this->truncate($exception->getMessage(), 240),
                'pending_jobs' => null,
                'failed_jobs' => null,
                'last_worker_activity_at' => null,
                'last_worker_activity_minutes_ago' => null,
                'heartbeat_status' => null,
                'oldest_pending_job_at' => null,
                'oldest_pending_job_minutes' => null,
                'note' => 'Worker liveness is inferred from queue job processing heartbeats.',
            ];
        }

        $lastActivityAt = $this->workerHeartbeat->lastActivityAt();
        $heartbeatStatus = $this->resolveHeartbeatStatus($lastActivityAt, $heartbeatStaleMinutes);
        $status = 'ok';
        $messages = [];

        if ($heartbeatStatus === 'never_seen') {
            $status = 'error';
            $messages[] = 'No worker activity has been recorded yet.';
        } elseif ($heartbeatStatus === 'stale') {
            $status = $this->worstHealthStatus($status, 'warning');
            $minutesAgo = $lastActivityAt !== null
                ? (int) $lastActivityAt->diffInMinutes(now())
                : null;
            $messages[] = $minutesAgo !== null
                ? "Last worker activity was {$minutesAgo} minutes ago (threshold: {$heartbeatStaleMinutes} minutes)."
                : "Worker heartbeat is stale (threshold: {$heartbeatStaleMinutes} minutes).";
        }

        if (
            $pendingJobs !== null
            && $pendingJobs > 0
            && $oldestPendingJobMinutes !== null
            && $oldestPendingJobMinutes >= $pendingJobStaleMinutes
        ) {
            $stuckStatus = $oldestPendingJobMinutes >= ($pendingJobStaleMinutes * 2)
                ? 'error'
                : 'warning';
            $status = $this->worstHealthStatus($status, $stuckStatus);
            $messages[] = "Oldest pending job has waited {$oldestPendingJobMinutes} minutes.";
        }

        if ($failedJobs !== null && $failedJobs > 0) {
            $status = $this->worstHealthStatus($status, 'warning');
            $messages[] = "{$failedJobs} failed job(s) in the queue.";
        }

        $message = $messages === []
            ? 'Workers are active and the queue is healthy.'
            : implode(' ', $messages);

        return [
            'status' => $status,
            'message' => $message,
            'connection' => $connection,
            'driver' => $driver,
            'pending_jobs' => $pendingJobs,
            'failed_jobs' => $failedJobs,
            'last_worker_activity_at' => $lastActivityAt?->toIso8601String(),
            'last_worker_activity_minutes_ago' => $lastActivityAt !== null
                ? (int) $lastActivityAt->diffInMinutes(now())
                : null,
            'heartbeat_status' => $heartbeatStatus,
            'oldest_pending_job_at' => $oldestPendingJobAt?->toIso8601String(),
            'oldest_pending_job_minutes' => $oldestPendingJobMinutes,
            'heartbeat_stale_minutes' => $heartbeatStaleMinutes,
            'pending_job_stale_minutes' => $pendingJobStaleMinutes,
            'note' => 'Worker liveness is inferred from queue job processing heartbeats, not process inspection. Scheduled heartbeat jobs require the Laravel scheduler to be running.',
        ];
    }

    private function resolveHeartbeatStatus(?Carbon $lastActivityAt, int $heartbeatStaleMinutes): string
    {
        if ($lastActivityAt === null) {
            return 'never_seen';
        }

        if ($lastActivityAt->diffInMinutes(now()) >= $heartbeatStaleMinutes) {
            return 'stale';
        }

        return 'fresh';
    }

    private function worstHealthStatus(string $current, string $candidate): string
    {
        $rank = [
            'ok' => 0,
            'warning' => 1,
            'error' => 2,
        ];

        return ($rank[$candidate] ?? 0) > ($rank[$current] ?? 0) ? $candidate : $current;
    }

    /**
     * @return list<array{timestamp: string|null, level: string, channel: string|null, message: string}>
     */
    private function recentLogEntries(): array
    {
        $logPath = storage_path('logs/laravel.log');

        if (! File::exists($logPath)) {
            return [];
        }

        $lines = $this->tailLogLines(
            $logPath,
            max(50, (int) config('admin.health_log_tail_lines', 200)),
        );

        $entries = $this->parseLogEntries($lines);
        $levels = array_map('strtoupper', (array) config('admin.health_log_levels', ['WARNING', 'ERROR']));
        $maxEntries = max(1, (int) config('admin.health_log_max_entries', 50));
        $maxMessageLength = max(120, (int) config('admin.health_log_message_max_length', 500));

        $filtered = array_values(array_filter(
            $entries,
            fn (array $entry): bool => in_array(strtoupper($entry['level']), $levels, true),
        ));

        $filtered = array_slice($filtered, -$maxEntries);

        return array_map(function (array $entry) use ($maxMessageLength): array {
            return [
                'timestamp' => $entry['timestamp'],
                'level' => strtoupper($entry['level']),
                'channel' => $entry['channel'],
                'message' => $this->truncate($entry['message'], $maxMessageLength),
            ];
        }, $filtered);
    }

    /**
     * @return list<string>
     */
    private function tailLogLines(string $path, int $lineCount): array
    {
        $handle = fopen($path, 'rb');

        if ($handle === false) {
            return [];
        }

        $buffer = '';
        $chunkSize = 8192;
        $lineTotal = 0;

        fseek($handle, 0, SEEK_END);
        $position = ftell($handle);

        while ($position > 0 && $lineTotal <= $lineCount) {
            $readSize = min($chunkSize, $position);
            $position -= $readSize;
            fseek($handle, $position);
            $chunk = fread($handle, $readSize);

            if ($chunk === false) {
                break;
            }

            $buffer = $chunk.$buffer;
            $lineTotal = substr_count($buffer, "\n");
        }

        fclose($handle);

        $lines = preg_split("/\r\n|\n|\r/", trim($buffer)) ?: [];

        return array_slice($lines, -$lineCount);
    }

    /**
     * @param  list<string>  $lines
     * @return list<array{timestamp: string|null, level: string, channel: string|null, message: string}>
     */
    private function parseLogEntries(array $lines): array
    {
        $entries = [];
        $current = null;

        foreach ($lines as $line) {
            if (preg_match('/^\[([^\]]+)\]\s+(\S+)\.(\w+):\s(.*)$/', $line, $matches)) {
                if ($current !== null) {
                    $entries[] = $current;
                }

                $current = [
                    'timestamp' => $matches[1],
                    'channel' => $matches[2],
                    'level' => $matches[3],
                    'message' => $matches[4],
                ];

                continue;
            }

            if ($current !== null) {
                $current['message'] .= "\n".$line;
            }
        }

        if ($current !== null) {
            $entries[] = $current;
        }

        return $entries;
    }

    private function applicationUsesRedis(): bool
    {
        $cacheStore = (string) config('cache.default', 'database');
        $cacheDriver = (string) config("cache.stores.{$cacheStore}.driver", $cacheStore);

        if ($cacheDriver === 'redis') {
            return true;
        }

        $queueConnection = (string) config('queue.default', 'sync');
        $queueDriver = (string) config("queue.connections.{$queueConnection}.driver", $queueConnection);

        if ($queueDriver === 'redis') {
            return true;
        }

        $sessionDriver = (string) config('session.driver', 'file');

        return $sessionDriver === 'redis';
    }

    private function truncate(string $value, int $maxLength): string
    {
        if (strlen($value) <= $maxLength) {
            return $value;
        }

        return substr($value, 0, max(0, $maxLength - 1)).'…';
    }
}
