<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cover letter design + font
    |--------------------------------------------------------------------------
    |
    | Stable product defaults for Auto Apply and Assist cover letter PDFs.
    | Keys are stored on cv_profiles.cover_letter_design / cover_letter_font.
    |
    */

    'design' => [
        'default' => 'teal-masthead',
        'variants' => [
            'teal-masthead' => [
                'id' => '01',
                'slug' => 'teal-masthead',
                'title' => 'Teal Masthead',
                'blurb' => 'Full-width teal header band, white Clash name, clean letter body.',
                'accent' => '#0f766e',
            ],
            'ink-sidebar' => [
                'id' => '02',
                'slug' => 'ink-sidebar',
                'title' => 'Ink Sidebar',
                'blurb' => 'Dark charcoal left rail for contact; light column for the letter.',
                'accent' => '#1c1f26',
            ],
            'swiss-rules' => [
                'id' => '03',
                'slug' => 'swiss-rules',
                'title' => 'Swiss Rules',
                'blurb' => 'Ultra-minimal black/white with hairline rules and oversized name.',
                'accent' => '#111111',
            ],
            'forest-rail' => [
                'id' => '04',
                'slug' => 'forest-rail',
                'title' => 'Forest Rail',
                'blurb' => 'Deep green left accent rail with refined single-column letter.',
                'accent' => '#163d2c',
            ],
            'coral-timeline' => [
                'id' => '05',
                'slug' => 'coral-timeline',
                'title' => 'Coral Accent',
                'blurb' => 'Warm coral date marker and accent underline on a calm letter.',
                'accent' => '#e06a4e',
            ],
            'asymmetric-split' => [
                'id' => '06',
                'slug' => 'asymmetric-split',
                'title' => 'Asymmetric Split',
                'blurb' => 'Wide name left, stacked contact right, then the letter body.',
                'accent' => '#2563eb',
            ],
            'slate-bands' => [
                'id' => '07',
                'slug' => 'slate-bands',
                'title' => 'Slate Band',
                'blurb' => 'Soft slate header band with strong display type above the letter.',
                'accent' => '#0f172a',
            ],
            'mono-bold' => [
                'id' => '08',
                'slug' => 'mono-bold',
                'title' => 'Mono Bold',
                'blurb' => 'High-contrast black header, mega display type, modern letter.',
                'accent' => '#0a0a0a',
            ],
            'ocean-wash' => [
                'id' => '09',
                'slug' => 'ocean-wash',
                'title' => 'Ocean Wash',
                'blurb' => 'Cool blue header wash into white body with airy letter spacing.',
                'accent' => '#1d4e89',
            ],
            'geometric-mark' => [
                'id' => '10',
                'slug' => 'geometric-mark',
                'title' => 'Geometric Mark',
                'blurb' => 'Large monogram mark beside the name, accent underline on sign-off.',
                'accent' => '#c45c26',
            ],
        ],
    ],

    'font' => [
        'default' => 'clash-display',
        'families' => [
            'clash-display' => [
                'label' => 'Clash Display',
                'display' => "'Clash Display', system-ui, sans-serif",
                'body' => "'Satoshi', system-ui, sans-serif",
                'stylesheet' => 'https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'satoshi' => [
                'label' => 'Satoshi',
                'display' => "'Satoshi', system-ui, sans-serif",
                'body' => "'Satoshi', system-ui, sans-serif",
                'stylesheet' => 'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'general-sans' => [
                'label' => 'General Sans',
                'display' => "'General Sans', system-ui, sans-serif",
                'body' => "'General Sans', system-ui, sans-serif",
                'stylesheet' => 'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'cabinet-grotesk' => [
                'label' => 'Cabinet Grotesk',
                'display' => "'Cabinet Grotesk', system-ui, sans-serif",
                'body' => "'Cabinet Grotesk', system-ui, sans-serif",
                'stylesheet' => 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'switzer' => [
                'label' => 'Switzer',
                'display' => "'Switzer', system-ui, sans-serif",
                'body' => "'Switzer', system-ui, sans-serif",
                'stylesheet' => 'https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'outfit' => [
                'label' => 'Outfit',
                'display' => "'Outfit', system-ui, sans-serif",
                'body' => "'Outfit', system-ui, sans-serif",
                'stylesheet' => 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'source-serif' => [
                'label' => 'Source Serif',
                'display' => "'Source Serif 4', Georgia, serif",
                'body' => "'Source Serif 4', Georgia, serif",
                'stylesheet' => 'https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap',
                'pdf_base' => 'times',
            ],
            'literata' => [
                'label' => 'Literata',
                'display' => "'Literata', Georgia, serif",
                'body' => "'Literata', Georgia, serif",
                'stylesheet' => 'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600;7..72,700&display=swap',
                'pdf_base' => 'times',
            ],
            'ibm-plex-sans' => [
                'label' => 'IBM Plex Sans',
                'display' => "'IBM Plex Sans', system-ui, sans-serif",
                'body' => "'IBM Plex Sans', system-ui, sans-serif",
                'stylesheet' => 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
                'pdf_base' => 'helvetica',
            ],
            'space-grotesk' => [
                'label' => 'Space Grotesk',
                'display' => "'Space Grotesk', system-ui, sans-serif",
                'body' => "'Space Grotesk', system-ui, sans-serif",
                'stylesheet' => 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
                'pdf_base' => 'helvetica',
            ],
        ],
    ],

];
