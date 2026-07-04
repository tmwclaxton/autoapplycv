<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class UploadValidationTest extends TestCase
{
    public function test_extension_upload_validation_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/upload-validation.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Upload validation script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
