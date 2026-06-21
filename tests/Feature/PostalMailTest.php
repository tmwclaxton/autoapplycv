<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PostalMailTest extends TestCase
{
    public function test_it_sends_mail_via_postal_http_api(): void
    {
        config([
            'mail.default' => 'postal',
            'services.postal.key' => 'test-postal-api-key',
            'services.postal.base_url' => 'https://postal.example.com',
            'mail.from.address' => 'hello@autocvapply.com',
            'mail.from.name' => 'AutoCVApply',
        ]);

        Http::fake([
            'https://postal.example.com/api/v1/send/message' => Http::response(['status' => 'success'], 200),
        ]);

        Mail::mailer('postal')->raw('Test message', function ($message): void {
            $message->to('toby@grantgunner.org')->subject('Postal test');
        });

        Http::assertSent(function ($request): bool {
            return $request->url() === 'https://postal.example.com/api/v1/send/message'
                && $request->hasHeader('X-Server-API-Key', 'test-postal-api-key')
                && str_contains((string) $request['from'], 'hello@autocvapply.com')
                && $request['to'] === ['toby@grantgunner.org']
                && $request['subject'] === 'Postal test'
                && $request['plain_body'] === 'Test message';
        });
    }
}
