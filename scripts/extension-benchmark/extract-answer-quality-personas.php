<?php

$js = file_get_contents(__DIR__.'/build-answer-quality-corpus.mjs');

if (! preg_match('/const PERSONAS = (\{[\s\S]*?\n\});\s*\nfunction employerNames/', $js, $matches)) {
    fwrite(STDERR, "Could not extract PERSONAS from JS builder.\n");
    exit(1);
}

$json = $matches[1];
$json = preg_replace('/(\s)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/', '$1"$2"$3', $json);
$json = preg_replace("/'([^']*)'/", '"$1"', $json);
$json = preg_replace('/,\s*(\}|\])/', '$1', $json);

$data = json_decode($json, true);

if (! is_array($data)) {
    fwrite(STDERR, 'JSON decode failed: '.json_last_error_msg()."\n");
    exit(1);
}

$out = __DIR__.'/answer-quality-personas.json';
file_put_contents($out, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
echo count($data)." personas written to {$out}\n";
