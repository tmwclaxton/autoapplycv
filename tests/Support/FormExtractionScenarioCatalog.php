<?php

namespace Tests\Support;

use RuntimeException;

final class FormExtractionScenarioCatalog
{
    /**
     * @return list<array<string, mixed>>
     */
    public static function all(): array
    {
        return self::manifest()['scenarios'] ?? [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function vetted(): array
    {
        return array_values(array_filter(
            self::all(),
            static fn (array $scenario): bool => ($scenario['status'] ?? '') === 'vetted',
        ));
    }

    public static function count(): int
    {
        return count(self::all());
    }

    public static function vettedCount(): int
    {
        return count(self::vetted());
    }

    /**
     * @return array<string, mixed>
     */
    public static function expectedFor(string $id): array
    {
        $path = base_path("tests/fixtures/form-extraction/expected/{$id}.json");

        if (! is_file($path)) {
            throw new RuntimeException("Missing expected fixture for [{$id}].");
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded)) {
            throw new RuntimeException("Invalid expected fixture for [{$id}].");
        }

        return $decoded;
    }

    /**
     * @return array<string, mixed>
     */
    private static function manifest(): array
    {
        $path = base_path('tests/fixtures/form-extraction/manifest.json');

        if (! is_file($path)) {
            throw new RuntimeException('Form extraction manifest is missing. Run npm run form-corpus:generate.');
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded)) {
            throw new RuntimeException('Form extraction manifest is invalid JSON.');
        }

        return $decoded;
    }
}
