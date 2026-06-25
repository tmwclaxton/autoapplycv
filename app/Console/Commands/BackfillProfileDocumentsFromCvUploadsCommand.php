<?php

namespace App\Console\Commands;

use App\Services\CvProfileDocumentService;
use Illuminate\Console\Command;

class BackfillProfileDocumentsFromCvUploadsCommand extends Command
{
    protected $signature = 'cv:backfill-profile-documents {--user= : Limit backfill to a single user ID}';

    protected $description = 'Create profile document records for CV uploads that predate the documents feature';

    public function handle(CvProfileDocumentService $documents): int
    {
        $userId = $this->option('user') !== null ? (int) $this->option('user') : null;
        $created = $documents->backfillFromCvUploads($userId);

        $this->info("Created {$created} profile document record(s) from CV uploads.");

        return self::SUCCESS;
    }
}
