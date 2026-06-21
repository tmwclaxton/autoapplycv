<?php

namespace App\Mail;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\MessageConverter;

class PostalTransport extends AbstractTransport
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
    ) {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        $email = MessageConverter::toEmail($message->getOriginalMessage());

        $payload = $this->buildPayload($email, $message->getEnvelope());

        $response = Http::withHeaders([
            'X-Server-API-Key' => $this->apiKey,
            'Content-Type' => 'application/json',
        ])->post(rtrim($this->baseUrl, '/').'/api/v1/send/message', $payload);

        if (! $response->successful()) {
            Log::error('Postal API send failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new \RuntimeException('Postal API returned '.$response->status().': '.$response->body());
        }
    }

    public function __toString(): string
    {
        return 'postal';
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPayload(Email $email, Envelope $envelope): array
    {
        $payload = [
            'from' => $envelope->getSender()->toString(),
            'to' => array_map(fn ($address) => $address->toString(), $envelope->getRecipients()),
            'subject' => $email->getSubject() ?? '',
        ];

        if ($email->getTextBody()) {
            $payload['plain_body'] = $email->getTextBody();
        }

        if ($email->getHtmlBody()) {
            $payload['html_body'] = $email->getHtmlBody();
        }

        $replyTo = $email->getReplyTo();
        if (! empty($replyTo)) {
            $payload['reply_to'] = $replyTo[0]->toString();
        }

        $cc = $email->getCc();
        if (! empty($cc)) {
            $payload['cc'] = array_map(fn ($address) => $address->toString(), $cc);
        }

        $bcc = $email->getBcc();
        if (! empty($bcc)) {
            $payload['bcc'] = array_map(fn ($address) => $address->toString(), $bcc);
        }

        return $payload;
    }
}
