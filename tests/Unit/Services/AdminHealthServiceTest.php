<?php

namespace Tests\Unit\Services;

use App\Services\AdminHealthService;
use App\Services\WorkerHeartbeatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class AdminHealthServiceTest extends TestCase
{
    use RefreshDatabase;

    private AdminHealthService $service;

    private WorkerHeartbeatService $workerHeartbeat;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(AdminHealthService::class);
        $this->workerHeartbeat = app(WorkerHeartbeatService::class);
    }

    public function test_admin_dashboard_data_includes_structured_health_checks(): void
    {
        $data = $this->service->adminDashboardData();

        $this->assertArrayHasKey('health', $data);
        $this->assertArrayHasKey('checked_at', $data['health']);
        $this->assertArrayHasKey('database', $data['health']);
        $this->assertArrayHasKey('redis', $data['health']);
        $this->assertArrayHasKey('workers', $data['health']);
        $this->assertArrayHasKey('log_entries', $data['health']);
        $this->assertSame('ok', $data['health']['database']['status']);
    }

    public function test_recent_log_entries_filter_warning_and_error_levels(): void
    {
        $logPath = storage_path('logs/laravel.log');
        File::ensureDirectoryExists(dirname($logPath));

        File::put($logPath, implode("\n", [
            '[2026-07-05 10:00:00] testing.INFO: Routine heartbeat',
            '[2026-07-05 10:01:00] testing.WARNING: Queue backlog growing',
            '[2026-07-05 10:02:00] testing.ERROR: Payment webhook failed',
        ]));

        $data = $this->service->adminDashboardData();

        $this->assertCount(2, $data['health']['log_entries']);
        $this->assertSame('WARNING', $data['health']['log_entries'][0]['level']);
        $this->assertSame('Queue backlog growing', $data['health']['log_entries'][0]['message']);
        $this->assertSame('ERROR', $data['health']['log_entries'][1]['level']);
        $this->assertSame('Payment webhook failed', $data['health']['log_entries'][1]['message']);
    }

    public function test_redis_check_reports_not_configured_when_unused(): void
    {
        Config::set('cache.default', 'database');
        Config::set('queue.default', 'database');
        Config::set('session.driver', 'file');

        $data = $this->service->adminDashboardData();

        $this->assertSame('warning', $data['health']['redis']['status']);
        $this->assertFalse($data['health']['redis']['configured']);
    }

    public function test_workers_check_reports_sync_driver_as_warning(): void
    {
        Config::set('queue.default', 'sync');

        $data = $this->service->adminDashboardData();

        $this->assertSame('warning', $data['health']['workers']['status']);
        $this->assertSame('sync', $data['health']['workers']['driver']);
        $this->assertNull($data['health']['workers']['pending_jobs']);
        $this->assertNull($data['health']['workers']['heartbeat_status']);
    }

    public function test_workers_check_reports_error_when_no_heartbeat_recorded(): void
    {
        Config::set('queue.default', 'database');

        $data = $this->service->adminDashboardData();

        $this->assertSame('error', $data['health']['workers']['status']);
        $this->assertSame('never_seen', $data['health']['workers']['heartbeat_status']);
        $this->assertNull($data['health']['workers']['last_worker_activity_at']);
        $this->assertSame(0, $data['health']['workers']['pending_jobs']);
        $this->assertSame(0, $data['health']['workers']['failed_jobs']);
    }

    public function test_workers_check_reports_ok_when_heartbeat_is_fresh(): void
    {
        Config::set('queue.default', 'database');
        Config::set('admin.worker_heartbeat_stale_minutes', 5);

        Carbon::setTestNow('2026-07-05 12:00:00');
        $this->workerHeartbeat->record();

        $data = $this->service->adminDashboardData();

        $this->assertSame('ok', $data['health']['workers']['status']);
        $this->assertSame('fresh', $data['health']['workers']['heartbeat_status']);
        $this->assertSame(0, $data['health']['workers']['last_worker_activity_minutes_ago']);
        $this->assertNotNull($data['health']['workers']['last_worker_activity_at']);
    }

    public function test_workers_check_reports_warning_when_heartbeat_is_stale(): void
    {
        Config::set('queue.default', 'database');
        Config::set('admin.worker_heartbeat_stale_minutes', 5);

        Carbon::setTestNow('2026-07-05 12:00:00');
        $this->workerHeartbeat->record();

        Carbon::setTestNow('2026-07-05 12:06:00');

        $data = $this->service->adminDashboardData();

        $this->assertSame('warning', $data['health']['workers']['status']);
        $this->assertSame('stale', $data['health']['workers']['heartbeat_status']);
        $this->assertSame(6, $data['health']['workers']['last_worker_activity_minutes_ago']);
    }

    public function test_workers_check_reports_error_when_pending_jobs_are_stuck(): void
    {
        Config::set('queue.default', 'database');
        Config::set('admin.worker_pending_job_stale_minutes', 10);

        Carbon::setTestNow('2026-07-05 12:00:00');
        $this->workerHeartbeat->record();

        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => '{}',
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => now()->subMinutes(25)->timestamp,
            'created_at' => now()->subMinutes(25)->timestamp,
        ]);

        $data = $this->service->adminDashboardData();

        $this->assertSame('error', $data['health']['workers']['status']);
        $this->assertSame(1, $data['health']['workers']['pending_jobs']);
        $this->assertSame(25, $data['health']['workers']['oldest_pending_job_minutes']);
    }

    public function test_workers_check_reports_warning_for_moderately_stale_pending_jobs(): void
    {
        Config::set('queue.default', 'database');
        Config::set('admin.worker_pending_job_stale_minutes', 10);

        Carbon::setTestNow('2026-07-05 12:00:00');
        $this->workerHeartbeat->record();

        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => '{}',
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => now()->subMinutes(12)->timestamp,
            'created_at' => now()->subMinutes(12)->timestamp,
        ]);

        $data = $this->service->adminDashboardData();

        $this->assertSame('warning', $data['health']['workers']['status']);
        $this->assertSame(12, $data['health']['workers']['oldest_pending_job_minutes']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
