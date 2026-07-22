<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Curated title/excerpt rewrites for formulaic published posts.
 */
class BlogTitleDiversify
{
    /**
     * @return array<string, array{title: string, excerpt: string, slug: string}>
     */
    public static function byOldSlug(): array
    {
        $rows = [
            'beginners-guide-to-using-a-cv-parser-for-job-applications-with-autocvapply' => [
                'title' => 'From PDF to profile: CV parsing that powers every AutoFill later',
                'excerpt' => 'Upload a CV once, review the editable profile AutoCVApply extracts, then reuse it for AutoFill on employer forms. Parsing is free; extension AI actions use monthly credits.',
            ],
            'beginners-guide-to-autofill-job-applications-with-autocvapply-for-faster-uk-job-hunting' => [
                'title' => 'Stop retyping your CV on every Workday form',
                'excerpt' => 'AutoFill pulls your saved profile into empty Workday and Greenhouse fields. You still review the page and click Submit on ATS career sites.',
            ],
            'how-to-save-time-and-cut-errors-using-the-linkedin-easy-apply-chrome-extension-from-autocvapply' => [
                'title' => 'LinkedIn Easy Apply from the Auto Apply sidebar',
                'excerpt' => 'Start a user-launched Auto Apply run for LinkedIn Easy Apply: search, open roles, fill steps, review screening answers, then submit from the extension sidebar.',
            ],
            'beginners-guide-to-saving-time-and-avoiding-errors-when-applying-for-graduate-jobs-with-autocvapplys-autofill-extension' => [
                'title' => 'Graduate applications at volume without rebuilding your details each time',
                'excerpt' => 'Keep one structured CV profile, AutoFill repetitive graduate-scheme forms, and use Draft All when screening questions show up. Stay in control of every submit.',
            ],
            'how-contractors-can-save-hours-and-cut-errors-using-autocvapplys-autofill-between-gigs' => [
                'title' => 'Between contracts: one CV profile across employer portals',
                'excerpt' => 'When you are applying between gigs, reuse a reviewed AutoCVApply profile to AutoFill career-site forms instead of pasting the same history into every portal.',
            ],
            'myth-buster-using-autocvapplys-autofill-is-safe-smart-and-puts-you-in-control' => [
                'title' => 'Autofill myths: you still review before anything is submitted',
                'excerpt' => 'AutoCVApply fills fields in your browser from your profile. On ATS sites you click Submit; on board Auto Apply you start the run yourself and can review drafted answers.',
            ],
            // Local regenerations that still shared an "Auto Apply sidebar / AutoCVApply's" shape.
            'using-autocvapplys-auto-apply-sidebar-with-the-linkedin-easy-apply-chrome-extension-to-review-and-submit-screening-questions' => [
                'title' => 'LinkedIn Easy Apply from the Auto Apply sidebar',
                'excerpt' => 'Start a user-launched Auto Apply run for LinkedIn Easy Apply: search, open roles, fill steps, review screening answers, then submit from the extension sidebar.',
            ],
            'myth-buster-draft-all-job-applications-with-autocvapply-create-human-tone-answers-on-workday-and-greenhouse' => [
                'title' => 'Draft All on Workday: screening answers from your CV, not filler',
                'excerpt' => 'Draft All writes free-text answers grounded in your saved profile on Workday and Greenhouse. Review the tone, then submit yourself.',
            ],
            '5-ways-to-autofill-job-applications-using-autocvapplys-autofill-on-workday-and-greenhouse-forms' => [
                'title' => 'Stop retyping your CV on every Workday form',
                'excerpt' => 'AutoFill pulls your saved profile into empty Workday and Greenhouse fields. You still review the page and click Submit on ATS career sites.',
            ],
            'how-to-use-autocvapplys-auto-apply-sidebar-for-indeed-apply-autofill-and-quick-apply-on-totaljobs-glassdoor-and-reed' => [
                'title' => 'Indeed, Totaljobs, Glassdoor, Reed: one Auto Apply sidebar',
                'excerpt' => 'Run end-to-end Auto Apply on UK boards from the extension: Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, and Reed Easy Apply - you start each session.',
            ],
        ];

        foreach ($rows as &$row) {
            $row['slug'] = Str::slug($row['title']);
        }

        return $rows;
    }
}
