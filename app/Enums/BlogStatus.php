<?php

namespace App\Enums;

enum BlogStatus: string
{
    case Draft = 'draft';
    case Published = 'published';
}
