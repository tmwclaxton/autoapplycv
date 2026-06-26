<?php

namespace App\Enums;

enum ApplicationArtifactType: string
{
    case CoverLetter = 'cover_letter';
    case TailoredResume = 'tailored_resume';
    case AtsReport = 'ats_report';

    public function label(): string
    {
        return match ($this) {
            self::CoverLetter => 'Cover letter',
            self::TailoredResume => 'Tailored resume',
            self::AtsReport => 'ATS report',
        };
    }
}
