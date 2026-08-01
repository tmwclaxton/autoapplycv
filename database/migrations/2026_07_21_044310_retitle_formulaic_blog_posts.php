<?php

use App\Support\BlogTitleDiversify;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-shot rewrite of formulaic blog titles/excerpts/slugs.
 *
 * Matches posts by previous slug so DBs without those rows are unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (BlogTitleDiversify::byOldSlug() as $oldSlug => $next) {
            $exists = DB::table('blogs')->where('slug', $oldSlug)->exists();
            if (! $exists) {
                continue;
            }

            $slug = $next['slug'];
            $attempt = 0;
            while (
                DB::table('blogs')
                    ->where('slug', $slug)
                    ->where('slug', '!=', $oldSlug)
                    ->exists()
            ) {
                $attempt++;
                $slug = $next['slug'].'-'.$attempt;
            }

            DB::table('blogs')
                ->where('slug', $oldSlug)
                ->update([
                    'title' => $next['title'],
                    'excerpt' => $next['excerpt'],
                    'slug' => $slug,
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        // Content rewrite - not reversible without the prior copy.
    }
};
