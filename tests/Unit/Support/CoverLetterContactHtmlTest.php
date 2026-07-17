<?php

namespace Tests\Unit\Support;

use App\Support\CoverLetterContactHtml;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CoverLetterContactHtmlTest extends TestCase
{
    #[Test]
    public function test_href_for_email_phone_and_urls(): void
    {
        $this->assertSame('mailto:alex@example.com', CoverLetterContactHtml::hrefFor('alex@example.com'));
        $this->assertSame('tel:+447700900123', CoverLetterContactHtml::hrefFor('+44 7700 900123'));
        $this->assertSame('https://linkedin.com/in/alex', CoverLetterContactHtml::hrefFor('linkedin.com/in/alex'));
        $this->assertSame('https://alex.dev', CoverLetterContactHtml::hrefFor('alex.dev'));
        $this->assertNull(CoverLetterContactHtml::hrefFor('London, United Kingdom'));
    }

    #[Test]
    public function test_contact_list_html_wraps_mailto_and_tel_anchors(): void
    {
        $html = CoverLetterContactHtml::contactListHtml([
            'email' => 'alex@example.com',
            'phone' => '+44 7700 900123',
            'location' => 'London',
            'linkedin_url' => 'linkedin.com/in/alex',
            'website_url' => 'https://alex.dev',
        ]);

        $this->assertStringContainsString('href="mailto:alex@example.com"', $html);
        $this->assertStringContainsString('href="tel:+447700900123"', $html);
        $this->assertStringContainsString('href="https://linkedin.com/in/alex"', $html);
        $this->assertStringContainsString('href="https://alex.dev"', $html);
        $this->assertStringContainsString('>London</', $html);
        $this->assertStringNotContainsString('href="mailto:London', $html);
    }

    #[Test]
    public function test_linkify_plain_text_wraps_urls_and_emails(): void
    {
        $html = CoverLetterContactHtml::linkifyPlainText(
            'Email alex@example.com or visit https://example.com/path.',
        );

        $this->assertStringContainsString('href="mailto:alex@example.com"', $html);
        $this->assertStringContainsString('href="https://example.com/path"', $html);
    }
}
