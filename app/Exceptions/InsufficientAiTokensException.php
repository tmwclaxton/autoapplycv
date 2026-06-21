<?php

namespace App\Exceptions;

use Exception;

class InsufficientAiTokensException extends Exception
{
    public function __construct()
    {
        parent::__construct('You have used all of your AI tokens for this billing period.');
    }
}
