<?php

namespace App\Enums;

enum ExtensionAutoApplyEventType: string
{
    case JobOpened = 'job_opened';
    case DraftAll = 'draft_all';
    case FieldFilled = 'field_filled';
    case StepAdvanced = 'step_advanced';
    case Submitted = 'submitted';
    case Skipped = 'skipped';
    case Error = 'error';
}
