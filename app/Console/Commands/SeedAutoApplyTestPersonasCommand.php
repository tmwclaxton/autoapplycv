<?php

namespace App\Console\Commands;

use App\Models\User;
use Database\Seeders\AutoApplyTestPersonasSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class SeedAutoApplyTestPersonasCommand extends Command
{
    protected $signature = 'testing:seed-auto-apply-personas {--fresh : Delete existing @autocvapply.test users before seeding}';

    protected $description = 'Seed local Auto Apply test personas with profiles, CV PDFs, credits, and extension tokens';

    public function handle(AutoApplyTestPersonasSeeder $seeder): int
    {
        if (! app()->environment('local')) {
            $this->error('This command is only available when APP_ENV=local.');

            return self::FAILURE;
        }

        $fixture = $seeder->loadFixture();
        $domain = (string) ($fixture['domain'] ?? '@autocvapply.test');

        if ($this->option('fresh')) {
            $emails = collect($fixture['personas'] ?? [])
                ->pluck('email')
                ->filter(fn ($email) => is_string($email) && str_ends_with($email, $domain))
                ->values()
                ->all();

            if ($emails !== []) {
                User::query()->whereIn('email', $emails)->delete();
                $this->warn('Removed existing test persona users.');
            }
        }

        $seeder->run();

        $connectionsPath = storage_path('app/testing/test-persona-connections.json');
        $connections = json_decode((string) Storage::disk('local')->get('testing/test-persona-connections.json'), true);

        $this->info('Auto Apply test personas seeded.');
        $this->line('Connections manifest: '.$connectionsPath);

        foreach ($connections['connections'] ?? [] as $connection) {
            $this->line(sprintf(
                '- %s (%s): token minted, api_base=%s',
                $connection['persona_id'] ?? '?',
                $connection['email'] ?? '?',
                $connection['api_base'] ?? '?',
            ));
        }

        $this->newLine();
        $this->comment('Copy a connection block into the extension sidebar or use request_auth MCP per persona.');

        return self::SUCCESS;
    }
}
