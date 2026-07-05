<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Throwable;

class WorkerHeartbeatService
{
    public function cacheKey(): string
    {
        return (string) config('admin.worker_heartbeat_cache_key', 'worker:last_heartbeat');
    }

    public function record(): void
    {
        Cache::forever($this->cacheKey(), now()->toIso8601String());
    }

    public function lastActivityAt(): ?Carbon
    {
        $timestamp = Cache::get($this->cacheKey());

        if (! is_string($timestamp) || $timestamp === '') {
            return null;
        }

        try {
            return Carbon::parse($timestamp);
        } catch (Throwable) {
            return null;
        }
    }
}
