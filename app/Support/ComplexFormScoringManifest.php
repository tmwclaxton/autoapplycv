<?php

namespace App\Support;

use InvalidArgumentException;

class ComplexFormScoringManifest
{
    public const MANIFEST_PATH = 'tests/fixtures/extension-e2e/complex-form-scoring-scenarios.json';

    public const REPORT_PATH = 'tests/fixtures/extension-e2e/complex-form-scoring-report.json';

    /**
     * @return array<string, mixed>
     */
    public static function load(): array
    {
        $path = base_path(self::MANIFEST_PATH);

        if (! is_file($path)) {
            throw new InvalidArgumentException(
                'Complex form scoring manifest not found. Run: node scripts/form-corpus/build-complex-form-scoring-scenarios.mjs',
            );
        }

        $manifest = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        FormE2eScoringManifest::validate($manifest);

        return $manifest;
    }
}
