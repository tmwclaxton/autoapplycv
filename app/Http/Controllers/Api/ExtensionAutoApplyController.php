<?php

namespace App\Http\Controllers\Api;

use App\Enums\ExtensionAutoApplyEventType;
use App\Enums\ExtensionAutoApplySessionStatus;
use App\Http\Controllers\Controller;
use App\Models\ExtensionAutoApplySession;
use App\Services\AiTokenService;
use App\Services\ExtensionAutoApplyAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ExtensionAutoApplyController extends Controller
{
    public function __construct(
        private readonly ExtensionAutoApplyAnalyticsService $analytics,
        private readonly AiTokenService $usage,
    ) {}

    public function storeSession(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'platform' => ['required', 'string', 'max:64'],
            'role_description' => ['required', 'string', 'max:512'],
            'max_applications' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $session = $this->analytics->startSession(
            user: $request->user(),
            platform: (string) $validated['platform'],
            roleDescription: (string) $validated['role_description'],
            maxApplications: (int) ($validated['max_applications'] ?? 10),
        );

        return response()->json([
            'success' => true,
            'session_id' => $session->id,
        ], 201);
    }

    public function updateSession(Request $request, ExtensionAutoApplySession $extensionAutoApplySession): JsonResponse
    {
        $this->authorizeSession($request, $extensionAutoApplySession);

        $validated = $request->validate([
            'status' => ['nullable', Rule::enum(ExtensionAutoApplySessionStatus::class)],
            'jobs_found' => ['nullable', 'integer', 'min:0'],
            'applied_count' => ['nullable', 'integer', 'min:0'],
            'skipped_count' => ['nullable', 'integer', 'min:0'],
            'error_count' => ['nullable', 'integer', 'min:0'],
            'fields_filled_count' => ['nullable', 'integer', 'min:0'],
            'stopped_at' => ['nullable', 'date'],
            'last_error' => ['nullable', 'string', 'max:1024'],
        ]);

        $session = $this->analytics->updateSession(
            session: $extensionAutoApplySession,
            payload: $validated,
        );

        return response()->json([
            'success' => true,
            'session_id' => $session->id,
        ]);
    }

    public function storeEvent(Request $request): JsonResponse
    {
        $maxBytes = (int) config('admin.page_capture_max_bytes', 5_000_000);

        $validated = $request->validate([
            'session_id' => ['required', 'integer', 'exists:extension_auto_apply_sessions,id'],
            'event_type' => ['required', Rule::enum(ExtensionAutoApplyEventType::class)],
            'job_title' => ['nullable', 'string', 'max:512'],
            'company' => ['nullable', 'string', 'max:512'],
            'job_url' => ['nullable', 'string', 'max:2048'],
            'fields_filled_count' => ['nullable', 'integer', 'min:0'],
            'metadata' => ['nullable', 'array'],
            'failure_html' => ['nullable', 'string', "max:{$maxBytes}"],
            'page_url' => ['nullable', 'string', 'max:2048'],
            'page_title' => ['nullable', 'string', 'max:512'],
        ]);

        $session = ExtensionAutoApplySession::query()->findOrFail((int) $validated['session_id']);
        $this->authorizeSession($request, $session);

        $eventType = ExtensionAutoApplyEventType::from((string) $validated['event_type']);
        $fieldsFilledCount = (int) ($validated['fields_filled_count'] ?? 0);
        $failureHtml = isset($validated['failure_html']) ? (string) $validated['failure_html'] : null;

        if ($failureHtml !== null && strlen($failureHtml) > $maxBytes) {
            throw ValidationException::withMessages([
                'failure_html' => 'Failure page HTML exceeds the maximum allowed size.',
            ]);
        }

        if ($failureHtml !== null && $eventType !== ExtensionAutoApplyEventType::Error) {
            throw ValidationException::withMessages([
                'failure_html' => 'Failure page HTML is only accepted for error events.',
            ]);
        }

        $event = $this->analytics->recordEvent(
            session: $session,
            eventType: $eventType,
            jobTitle: isset($validated['job_title']) ? (string) $validated['job_title'] : null,
            company: isset($validated['company']) ? (string) $validated['company'] : null,
            jobUrl: isset($validated['job_url']) ? (string) $validated['job_url'] : null,
            fieldsFilledCount: $fieldsFilledCount,
            metadata: $validated['metadata'] ?? null,
            failureHtml: $failureHtml,
            pageUrl: isset($validated['page_url']) ? (string) $validated['page_url'] : null,
            pageTitle: isset($validated['page_title']) ? (string) $validated['page_title'] : null,
        );

        if ($eventType === ExtensionAutoApplyEventType::DraftAll && $fieldsFilledCount > 0) {
            $this->usage->recordFieldsAutofilled($request->user(), $fieldsFilledCount);
        }

        return response()->json([
            'success' => true,
            'event_id' => $event->id,
        ], 201);
    }

    private function authorizeSession(Request $request, ExtensionAutoApplySession $session): void
    {
        if ($session->user_id !== $request->user()?->id) {
            throw ValidationException::withMessages([
                'session_id' => 'You do not have access to this Auto Apply session.',
            ]);
        }
    }
}
