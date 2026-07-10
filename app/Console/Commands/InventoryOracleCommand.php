<?php

namespace App\Console\Commands;

use App\Services\FormCorpusInventoryOracleService;
use Illuminate\Console\Command;

class InventoryOracleCommand extends Command
{
    protected $signature = 'form-corpus:inventory-oracle
                            {--payload= : JSON payload string (otherwise read stdin)}';

    protected $description = 'NanoGPT independent field inventory from HTML (JSON in/out)';

    public function handle(FormCorpusInventoryOracleService $oracle): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->writeJson([
                'fields' => [],
                'notes' => '',
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
                'fields' => [],
                'notes' => '',
                'error' => 'Invalid JSON payload.',
            ]);

            return self::FAILURE;
        }

        $result = $oracle->extract($decoded);
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
