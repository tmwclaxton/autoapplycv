<?php

/**
 * Merge curated scenario shards and validate uniqueness.
 * Does not invent questions.
 */
$shardDir = __DIR__.'/answer-format-guardrails/scenarios';
$out = __DIR__.'/answer-format-guardrails-scenarios.json';

$files = glob($shardDir.'/*.json') ?: [];
sort($files);

$scenarios = [];
$ids = [];
$labels = [];

foreach ($files as $file) {
    $chunk = json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
    if (! is_array($chunk)) {
        throw new RuntimeException('Invalid shard: '.$file);
    }

    foreach ($chunk as $row) {
        if (! is_array($row) || ! is_string($row['id'] ?? null) || ! is_string($row['label'] ?? null)) {
            throw new RuntimeException('Invalid scenario in '.$file);
        }

        if (isset($ids[$row['id']])) {
            throw new RuntimeException('Duplicate id '.$row['id']);
        }

        $labelKey = mb_strtolower(trim($row['label']));
        if (isset($labels[$labelKey])) {
            throw new RuntimeException('Duplicate label: '.$row['label']);
        }

        $ids[$row['id']] = true;
        $labels[$labelKey] = true;
        $scenarios[] = $row;
    }
}

if (count($scenarios) < 1000) {
    throw new RuntimeException('Expected at least 1000 curated scenarios, got '.count($scenarios));
}

file_put_contents($out, json_encode($scenarios, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
echo 'Merged '.count($scenarios).' curated scenarios to '.$out.PHP_EOL;
