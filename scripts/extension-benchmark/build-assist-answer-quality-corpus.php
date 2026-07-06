#!/usr/bin/env php
<?php

use App\Support\AssistAnswerQualityCorpus;
use App\Support\AssistAnswerQualityCorpusBuilder;
use Illuminate\Contracts\Console\Kernel;

declare(strict_types=1);

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

AssistAnswerQualityCorpusBuilder::writeJsonFile();

$corpus = AssistAnswerQualityCorpus::load();

fwrite(STDOUT, 'Wrote '.AssistAnswerQualityCorpus::CORPUS_PATH.' ('.count($corpus['scenarios'])." scenarios)\n");
