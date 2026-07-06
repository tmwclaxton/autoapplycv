<?php

declare(strict_types=1);

require __DIR__.'/../../../vendor/autoload.php';

$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

use App\Support\AiPhraseDenylist;
use Illuminate\Contracts\Console\Kernel;

$answer = $argv[1] ?? '';
$violations = AiPhraseDenylist::findViolations($answer);
$penalty = AiPhraseDenylist::mechanicalPenalty($violations);

echo json_encode([
    'hard' => $violations['hard'],
    'soft' => $violations['soft'],
    'passed' => $penalty['passed'],
    'reason' => $penalty['reason'],
], JSON_THROW_ON_ERROR);
