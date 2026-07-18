<?php

$manifestPath = base_path('extension/manifest.json');
$manifest = json_decode((string) file_get_contents($manifestPath), true, flags: JSON_THROW_ON_ERROR);

if (! is_array($manifest) || ! is_string($manifest['version'] ?? null) || $manifest['version'] === '') {
    throw new RuntimeException('extension/manifest.json must include a non-empty version string.');
}

return [

    /*
    |--------------------------------------------------------------------------
    | Extension package version
    |--------------------------------------------------------------------------
    |
    | Sourced from extension/manifest.json so download URLs, zip builds, and
    | the packaged extension stay on one version.
    |
    */

    'version' => $manifest['version'],

];
