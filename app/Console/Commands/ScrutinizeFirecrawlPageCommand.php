<?php

namespace App\Console\Commands;

use App\Services\FormCorpusFirecrawlScrutinyService;
use Illuminate\Console\Command;

class ScrutinizeFirecrawlPageCommand extends Command
{
    protected $signature = 'form-corpus:scrutinize-firecrawl-page
                            {--payload= : JSON payload string (otherwise read stdin)}';

    protected $description = 'NanoGPT scrutiny for a scraped Firecrawl page (JSON in/out)';

    public function handle(FormCorpusFirecrawlScrutinyService $scrutiny): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->writeJson([
                'accept' => false,
                'reason' => 'NANOGPT_API_KEY is required.',
                'confidence' => 0.0,
                'issues' => ['missing_api_key'],
                'error' => 'NANOGPT_API_KEY is required.',
            ]);

            return self::FAILURE;
        }

        $raw = $this->option('payload');

        if (! is_string($raw) || trim($raw) === '') {
            $raw = stream_get_contents(STDIN) ?: '';
        }

        $decoded = json_decode(trim($raw), true);

        if (! is_array($decoded)) {
            $this->writeJson([
                'accept' => false,
                'reason' => 'Invalid JSON payload.',
                'confidence' => 0.0,
                'issues' => ['invalid_payload'],
                'error' => 'Invalid JSON payload.',
            ]);

            return self::FAILURE;
        }

        $result = $scrutiny->scrutinize($decoded);
        $this->writeJson($result);

        return isset($result['error']) ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function writeJson(array $payload): void
    {
        $this->line(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }
}
