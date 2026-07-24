<?php

require __DIR__.'/../../vendor/autoload.php';

use App\Support\AnswerFormatGuardrailCorpusBuilder;
use Illuminate\Contracts\Console\Kernel;

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$path = $argv[1] ?? __DIR__.'/answer-format-guardrails-corpus.json';
AnswerFormatGuardrailCorpusBuilder::writeJsonFile($path);

$corpus = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
echo 'Wrote '.($corpus['scenario_count'] ?? 0).' scenarios to '.$path.PHP_EOL;
