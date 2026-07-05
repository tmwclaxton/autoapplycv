<?php

namespace Tests\Unit\Extension;

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class DraftBatchChatTest extends TestCase
{
    public function test_extension_draft_batch_chat_script_passes(): void
    {
        $result = Process::path(base_path())
            ->timeout(30)
            ->run(['node', 'scripts/extension-test/draft-batch-chat.mjs']);

        $this->assertTrue(
            $result->successful(),
            'Draft batch chat script failed:'."\n".$result->errorOutput().$result->output(),
        );
    }
}
