<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class NanoGptSpendWarningMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $period,
        public readonly int $thresholdPercent,
        public readonly float $spentGbp,
        public readonly float $capGbp,
    ) {}

    public function envelope(): Envelope
    {
        $subject = $this->thresholdPercent >= 100
            ? "NanoGPT monthly budget reached ({$this->period})"
            : "NanoGPT monthly budget warning ({$this->thresholdPercent}% - {$this->period})";

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.nanogpt-spend-warning',
            with: [
                'period' => $this->period,
                'thresholdPercent' => $this->thresholdPercent,
                'spentGbp' => round($this->spentGbp, 2),
                'capGbp' => round($this->capGbp, 2),
                'remainingGbp' => round(max(0, $this->capGbp - $this->spentGbp), 2),
                'isExhausted' => $this->thresholdPercent >= 100,
            ],
        );
    }
}
