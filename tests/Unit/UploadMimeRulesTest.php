<?php

namespace Tests\Unit;

use App\Support\UploadMimeRules;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class UploadMimeRulesTest extends TestCase
{
    #[Test]
    public function test_cv_upload_mimes_exclude_spreadsheets(): void
    {
        $mimes = UploadMimeRules::cvUploadMimes();

        $this->assertContains('pdf', $mimes);
        $this->assertContains('docx', $mimes);
        $this->assertContains('txt', $mimes);
        $this->assertNotContains('xlsx', $mimes);
        $this->assertNotContains('xls', $mimes);
    }

    #[Test]
    public function test_document_upload_mimes_allow_spreadsheets(): void
    {
        $mimes = UploadMimeRules::documentUploadMimes();

        $this->assertContains('pdf', $mimes);
        $this->assertContains('png', $mimes);
        $this->assertContains('xlsx', $mimes);
        $this->assertContains('xls', $mimes);
    }

    #[Test]
    public function test_accept_attributes_include_dot_prefixes(): void
    {
        $this->assertStringContainsString('.pdf', UploadMimeRules::cvAcceptAttribute());
        $this->assertStringContainsString('.xlsx', UploadMimeRules::documentAcceptAttribute());
        $this->assertStringNotContainsString('.xlsx', UploadMimeRules::cvAcceptAttribute());
    }
}
