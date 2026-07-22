<?php

use App\Support\BlogTitleDiversify;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Second-pass retitle: punchier, non-beginner-guide titles.
 *
 * Safe if the first retitle migration already ran - aliases cover both old
 * beginner slugs and the intermediate diversify slugs.
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
