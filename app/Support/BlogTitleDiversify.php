<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Curated title/excerpt rewrites for formulaic published posts.
 *
 * Keys are previous slugs (including intermediate retitle slugs) so rewrites
 * stay idempotent across deploys.
 */
class BlogTitleDiversify
{
    /**
     * @return array<string, array{title: string, excerpt: string, slug: string}>
     */
    public static function byOldSlug(): array
    {
        $canonical = self::canonicalByTopic();
        $rows = [];

        foreach (self::slugAliasesByTopic() as $topic => $aliases) {
            foreach ($aliases as $oldSlug) {
                $rows[$oldSlug] = $canonical[$topic];
            }
        }

        foreach ($rows as &$row) {
            $row['slug'] = Str::slug($row['title']);
        }

        return $rows;
    }

    /**
     * Distinct voices on purpose: question, imperative, feature, observation, situation, myth.
     *
     * @return array<string, array{title: string, excerpt: string}>
     */
    public static function canonicalByTopic(): array
    {
        return [
            'cv-parser' => [
                'title' => 'Why upload a CV to AutoCVApply before you apply?',
                'excerpt' => 'Parsing turns your PDF into an editable profile you can correct once. That profile is what AutoFill and Draft All reuse on later applications.',
            ],
            'workday-autofill' => [
                'title' => 'Workday wants your life story again. AutoFill it.',
                'excerpt' => 'Empty Workday and Greenhouse fields get your saved profile. You still review the page and click Submit on ATS career sites.',
            ],
            'linkedin-auto-apply' => [
                'title' => 'Easy Apply at speed: Auto Apply from the sidebar',
                'excerpt' => 'Launch a LinkedIn Easy Apply session yourself: search, open roles, fill steps, check screening answers, then submit from the extension.',
            ],
            'graduate-volume' => [
                'title' => 'Graduate schemes recycle the same fields. So should your profile.',
                'excerpt' => 'One structured profile covers the contact and history questions that show up on every scheme form. Use Draft All when the free-text screeners appear.',
            ],
            'contractor-between-gigs' => [
                'title' => 'Between contracts: keep one profile warm',
                'excerpt' => 'When you are applying between gigs, reuse a reviewed profile instead of rebuilding employment history on every employer portal.',
            ],
            'autofill-control-myth' => [
                'title' => 'Autofill is not a silent bot',
                'excerpt' => 'AutoCVApply fills fields in your browser from your profile. On ATS sites you click Submit. On board Auto Apply, you start the run and can review drafted answers.',
            ],
            'draft-all-workday' => [
                'title' => 'Draft All vs blank "Why this role?" boxes on Workday',
                'excerpt' => 'Draft All writes free-text answers from your saved CV on Workday and Greenhouse. Edit the tone, then submit yourself.',
            ],
            'uk-boards-auto-apply' => [
                'title' => 'One sidebar for Indeed, Totaljobs, Glassdoor, and Reed',
                'excerpt' => 'End-to-end Auto Apply on UK boards from the extension: Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, and Reed Easy Apply - you start each session.',
            ],
        ];
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function slugAliasesByTopic(): array
    {
        return [
            'cv-parser' => [
                'beginners-guide-to-using-a-cv-parser-for-job-applications-with-autocvapply',
                'from-pdf-to-profile-cv-parsing-that-powers-every-autofill-later',
            ],
            'workday-autofill' => [
                'beginners-guide-to-autofill-job-applications-with-autocvapply-for-faster-uk-job-hunting',
                'stop-retyping-your-cv-on-every-workday-form',
                '5-ways-to-autofill-job-applications-using-autocvapplys-autofill-on-workday-and-greenhouse-forms',
            ],
            'linkedin-auto-apply' => [
                'how-to-save-time-and-cut-errors-using-the-linkedin-easy-apply-chrome-extension-from-autocvapply',
                'linkedin-easy-apply-from-the-auto-apply-sidebar',
                'using-autocvapplys-auto-apply-sidebar-with-the-linkedin-easy-apply-chrome-extension-to-review-and-submit-screening-questions',
            ],
            'graduate-volume' => [
                'beginners-guide-to-saving-time-and-avoiding-errors-when-applying-for-graduate-jobs-with-autocvapplys-autofill-extension',
                'graduate-applications-at-volume-without-rebuilding-your-details-each-time',
            ],
            'contractor-between-gigs' => [
                'how-contractors-can-save-hours-and-cut-errors-using-autocvapplys-autofill-between-gigs',
                'between-contracts-one-cv-profile-across-employer-portals',
            ],
            'autofill-control-myth' => [
                'myth-buster-using-autocvapplys-autofill-is-safe-smart-and-puts-you-in-control',
                'autofill-myths-you-still-review-before-anything-is-submitted',
            ],
            'draft-all-workday' => [
                'myth-buster-draft-all-job-applications-with-autocvapply-create-human-tone-answers-on-workday-and-greenhouse',
                'draft-all-on-workday-screening-answers-from-your-cv-not-filler',
            ],
            'uk-boards-auto-apply' => [
                'how-to-use-autocvapplys-auto-apply-sidebar-for-indeed-apply-autofill-and-quick-apply-on-totaljobs-glassdoor-and-reed',
                'indeed-totaljobs-glassdoor-reed-one-auto-apply-sidebar',
            ],
        ];
    }
}
