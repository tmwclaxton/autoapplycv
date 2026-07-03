<?php

namespace Tests\Support;

use App\Models\CvProfile;
use App\Services\ProfileLocationUpdateResolver;
use App\Services\ProfileWrittenValuePolisher;
use App\Support\ProfileFieldRegistry;

/**
 * Resolves assist chat Apply actions the same way streamChat does (AI extraction + location bundle).
 */
class AssistChatActionResolver
{
    public function __construct(
        private readonly ProfileLocationUpdateResolver $locationResolver,
        private readonly ProfileWrittenValuePolisher $polisher,
    ) {}

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @param  array<int, array{field: string, value: mixed}>  $extractedUpdates
     * @return array<int, array{field: string, value: mixed}>
     */
    public function resolve(CvProfile $profile, array $conversation, string $assistantMessage, array $extractedUpdates = []): array
    {
        $normalizedExtracted = $this->normalizeExtracted($extractedUpdates);
        $merged = $this->mergeUpdates(
            $normalizedExtracted,
            $normalizedExtracted === []
                ? $this->locationResolver->resolve($profile, $conversation, $assistantMessage)
                : [],
        );

        $polished = $this->polisher->polishUpdates($merged);

        return array_map(
            static fn (array $update): array => [
                'field' => $update['field'],
                'value' => $update['value'],
            ],
            $polished,
        );
    }

    /**
     * @param  array<int, array{field: string, value: mixed}>  $extractedUpdates
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function normalizeExtracted(array $extractedUpdates): array
    {
        $normalized = [];

        foreach ($extractedUpdates as $update) {
            $metadata = ProfileFieldRegistry::metadata((string) $update['field']);

            if ($metadata === null) {
                continue;
            }

            $normalized[] = [
                'field' => $update['field'],
                'label' => $metadata['label'],
                'value' => $update['value'],
                'reason' => 'Extracted.',
                'dashboard_tab' => $metadata['tab'],
                'dashboard_anchor' => $metadata['anchor'],
                'path' => $metadata['path'],
            ];
        }

        return $normalized;
    }

    /**
     * @param  array<int, array{field: string, value: mixed}>  ...$lists
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function mergeUpdates(array ...$lists): array
    {
        $merged = [];

        foreach ($lists as $updates) {
            foreach ($updates as $update) {
                $merged[$update['field']] = $update;
            }
        }

        return array_values($merged);
    }
}
