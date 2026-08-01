<?php

use App\Support\BlogTitleDiversify;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Replace formulaic AI bodies with curated product posts.
 * Pins "What is AutoCVApply?" as the newest index entry.
 */
return new class extends Migration
{
    public function up(): void
    {
        $seenIds = [];

        foreach (BlogTitleDiversify::byOldSlug() as $oldSlug => $next) {
            $row = DB::table('blogs')->where('slug', $oldSlug)->first(['id', 'slug']);
            if ($row === null || isset($seenIds[$row->id])) {
                continue;
            }
            $seenIds[$row->id] = true;

            $slug = $next['slug'];
            $attempt = 0;
            while (
                DB::table('blogs')
                    ->where('slug', $slug)
                    ->where('id', '!=', $row->id)
                    ->exists()
            ) {
                $attempt++;
                $slug = $next['slug'].'-'.$attempt;
            }

            $payload = [
                'title' => $next['title'],
                'excerpt' => $next['excerpt'],
                'slug' => $slug,
                'body' => $next['body'],
                'tags' => json_encode(array_values($next['tags'])),
                'updated_at' => now(),
            ];

            if (($next['pin_newest'] ?? false) === true) {
                $payload['published_at'] = now();
            }

            DB::table('blogs')->where('id', $row->id)->update($payload);
        }
    }

    public function down(): void
    {
        // Content rewrite - not reversible without the prior copy.
    }
};
