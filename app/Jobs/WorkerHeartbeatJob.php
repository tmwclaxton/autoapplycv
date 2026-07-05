<?php

namespace App\Jobs;

use App\Services\WorkerHeartbeatService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class WorkerHeartbeatJob implements ShouldQueue
{
    use Queueable;

    public function handle(WorkerHeartbeatService $heartbeat): void
    {
        $heartbeat->record();
    }
}
