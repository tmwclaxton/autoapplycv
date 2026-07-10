<?php

namespace App\Support;

class FormCorpusManifest
{
    public const FIXTURE_ROOT = 'tests/fixtures/form-extraction';

    public const HTML_DIR = self::FIXTURE_ROOT.'/html';

    public const BRIEFS_DIR = self::FIXTURE_ROOT.'/briefs';

    public const MANIFEST_PATH = self::FIXTURE_ROOT.'/manifest.json';

    public const AI_BATCH_REPORT_PATH = self::FIXTURE_ROOT.'/ai-corpus-batch-report.json';

    public const FIRECRAWL_SCRUTINY_CACHE_PATH = self::FIXTURE_ROOT.'/firecrawl-scrutiny-cache.json';

    public static function root(): string
    {
        return base_path(self::FIXTURE_ROOT);
    }

    public static function htmlPath(string $id): string
    {
        return base_path(self::HTML_DIR.'/'.$id.'.html');
    }

    public static function briefPath(string $id): string
    {
        return base_path(self::BRIEFS_DIR.'/'.$id.'.json');
    }

    /**
     * @return array{version: int, scenarios: array<int, array<string, mixed>>}
     */
    public static function load(): array
    {
        $path = base_path(self::MANIFEST_PATH);

        if (! is_readable($path)) {
            return ['version' => 1, 'scenarios' => []];
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : ['version' => 1, 'scenarios' => []];
    }

    /**
     * @param  array{version: int, scenarios: array<int, array<string, mixed>>}  $manifest
     */
    public static function save(array $manifest): void
    {
        $path = base_path(self::MANIFEST_PATH);
        file_put_contents($path, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
    }
}
