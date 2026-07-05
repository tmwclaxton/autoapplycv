<?php

return [

    'allowed_emails' => [
        'tmwclaxton@gmail.com',
        'tobyclaxton@canvassr.org',
    ],

    'page_capture_max_bytes' => 5_000_000,

    'dashboard_chart_days' => 30,

    'recent_signups_limit' => 15,

    'page_captures_per_page' => 25,

    'power_user_top_limit' => 10,

    'power_user_token_threshold' => 50_000,

    'health_log_tail_lines' => 200,

    'health_log_max_entries' => 50,

    'health_log_levels' => ['WARNING', 'ERROR'],

    'health_log_message_max_length' => 500,

    'worker_heartbeat_cache_key' => 'worker:last_heartbeat',

    'worker_heartbeat_stale_minutes' => 5,

    'worker_pending_job_stale_minutes' => 10,

];
