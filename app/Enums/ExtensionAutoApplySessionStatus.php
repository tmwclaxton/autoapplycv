<?php

namespace App\Enums;

enum ExtensionAutoApplySessionStatus: string
{
    case Running = 'running';
    case Stopped = 'stopped';
    case Completed = 'completed';
    case Error = 'error';

    public function label(): string
    {
        return match ($this) {
            self::Running => 'Running',
            self::Stopped => 'Stopped',
            self::Completed => 'Completed',
            self::Error => 'Error',
        };
    }
}
