<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CoverLetterPdfBuilder;
use App\Support\CoverLetterContactHtml;
use App\Support\CoverLetterDesignSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CoverLetterDesignSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_update_persists_cover_letter_design_and_font(): void
    {
        $user = User::factory()->create();
        $user->cvProfile()->create([
            'parsing_complete' => true,
            'cover_letter_design' => 'teal-masthead',
            'cover_letter_font' => 'clash-display',
        ]);

        $this->actingAs($user)
            ->patchJson(route('api.profile.update'), [
                'cover_letter_design' => 'ink-sidebar',
                'cover_letter_font' => 'space-grotesk',
            ])
            ->assertOk()
            ->assertJsonPath('profile.cover_letter_design', 'ink-sidebar')
            ->assertJsonPath('profile.cover_letter_font', 'space-grotesk');

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
            'cover_letter_design' => 'ink-sidebar',
            'cover_letter_font' => 'space-grotesk',
        ]);
    }

    public function test_api_profile_includes_cover_letter_design_settings(): void
    {
        $user = User::factory()->create();
        $user->cvProfile()->create([
            'parsing_complete' => true,
            'cover_letter_design' => 'ocean-wash',
            'cover_letter_font' => 'literata',
        ]);

        $this->actingAs($user)
            ->getJson(route('api.profile'))
            ->assertOk()
            ->assertJsonPath('profile.cover_letter_design', 'ocean-wash')
            ->assertJsonPath('profile.cover_letter_font', 'literata')
            ->assertJsonPath('cover_letter_design', 'ocean-wash')
            ->assertJsonPath('cover_letter_font', 'literata');
    }

    public function test_cover_letter_pdf_uses_profile_design_and_font(): void
    {
        $user = User::factory()->create();
        $profile = $user->cvProfile()->create([
            'parsing_complete' => true,
            'full_name' => 'Alex Morgan',
            'email' => 'alex@example.com',
            'cover_letter_design' => 'mono-bold',
            'cover_letter_font' => 'source-serif',
        ]);

        $pdf = app(CoverLetterPdfBuilder::class)->build(
            "Dear Hiring Manager,\n\nI am writing to apply.\n\nYours sincerely,\nAlex Morgan",
            $profile->only(['full_name', 'headline', 'email', 'phone', 'city', 'location']),
            ['title' => 'Engineer', 'company' => 'Acme'],
            [
                'design' => $profile->cover_letter_design,
                'font' => $profile->cover_letter_font,
            ],
        );

        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertStringContainsString('/CoverLetterDesign (mono-bold)', $pdf);
        $this->assertStringContainsString('/CoverLetterFont (source-serif)', $pdf);
        $this->assertStringContainsString('/BaseFont /Times-Bold', $pdf);
    }

    public function test_invalid_cover_letter_design_is_rejected(): void
    {
        $user = User::factory()->create();
        $user->cvProfile()->create(['parsing_complete' => true]);

        $this->actingAs($user)
            ->patchJson(route('api.profile.update'), [
                'cover_letter_design' => 'not-a-real-design',
            ])
            ->assertStatus(422);
    }

    public function test_dashboard_receives_cover_letter_design_options(): void
    {
        $user = User::factory()->create();
        $user->cvProfile()->create(['parsing_complete' => true]);

        $this->actingAs($user)
            ->get(route('dashboard', ['tab' => 'cover-letter']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Dashboard')
                ->has('coverLetterDesignOptions.designs', count(CoverLetterDesignSettings::designKeys()))
                ->has('coverLetterDesignOptions.fonts', count(CoverLetterDesignSettings::fontKeys()))
                ->where('coverLetterDesignOptions.sample.full_name', 'James Mitchell')
                ->where('coverLetterDesignOptions.sample.signoff', 'Yours faithfully,')
                ->has('coverLetterDesignOptions.sample.paragraphs', 3));
    }

    public function test_sample_cover_letter_body_follows_why_experience_fit_structure(): void
    {
        $sample = CoverLetterDesignSettings::sampleLetter();

        $this->assertSame('Dear Hiring Manager,', $sample['greeting']);
        $this->assertSame('Yours faithfully,', $sample['signoff']);
        $this->assertCount(3, $sample['paragraphs']);
        $this->assertStringContainsString('Northwind Labs', $sample['paragraphs'][0]);
        $this->assertStringContainsString('Riverbank Systems', $sample['paragraphs'][1]);
        $this->assertStringContainsString('welcome a conversation', $sample['paragraphs'][2]);
        $this->assertStringNotContainsString('james.mitchell@example.com', implode("\n", $sample['paragraphs']));
    }

    public function test_ink_sidebar_preview_css_wraps_long_sidebar_and_body_text(): void
    {
        $css = CoverLetterDesignSettings::designCss('ink-sidebar');

        $this->assertStringContainsString('overflow-wrap: anywhere', $css);
        $this->assertStringContainsString('word-break: break-word', $css);
        $this->assertStringContainsString('minmax(0, 1fr)', $css);
        $this->assertStringContainsString('white-space: normal', $css);
        $this->assertStringNotContainsString('white-space: nowrap', $css);
    }

    public function test_preview_css_justifies_body_paragraphs(): void
    {
        foreach (CoverLetterDesignSettings::designKeys() as $design) {
            $css = CoverLetterDesignSettings::designCss($design);

            $this->assertStringContainsString('text-align: justify', $css, $design);
            $this->assertStringContainsString('.paragraph', $css, $design);
            $this->assertMatchesRegularExpression(
                '/\.paragraph\s*\{[^}]*text-align:\s*justify/s',
                $css,
                $design,
            );
            $this->assertStringContainsString('hyphens: auto', $css, $design);
        }
    }

    public function test_sample_contact_html_uses_mailto_and_tel_anchors(): void
    {
        $sample = CoverLetterDesignSettings::sampleLetter();
        $html = CoverLetterContactHtml::contactListHtml($sample);

        $this->assertStringContainsString('href="mailto:james.mitchell@example.com"', $html);
        $this->assertStringContainsString('href="tel:+447837370669"', $html);
        $this->assertStringContainsString('href="https://linkedin.com/in/james-mitchell"', $html);
        $this->assertStringContainsString('href="https://jamesmitchell.dev"', $html);
        $this->assertStringContainsString('London, United Kingdom', $html);
        $this->assertStringNotContainsString('href="mailto:London', $html);
    }

    public function test_random_preferences_persist_and_resolve(): void
    {
        $user = User::factory()->create();
        $user->cvProfile()->create([
            'parsing_complete' => true,
            'cover_letter_design' => 'teal-masthead',
            'cover_letter_font' => 'clash-display',
        ]);

        $this->actingAs($user)
            ->patchJson(route('api.profile.update'), [
                'cover_letter_design' => 'random',
                'cover_letter_font' => 'random',
            ])
            ->assertOk()
            ->assertJsonPath('profile.cover_letter_design', 'random')
            ->assertJsonPath('profile.cover_letter_font', 'random');

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
            'cover_letter_design' => 'random',
            'cover_letter_font' => 'random',
        ]);

        $resolved = CoverLetterDesignSettings::resolveForGeneration('forest-rail', 'outfit');
        $this->assertSame('forest-rail', $resolved['cover_letter_design']);
        $this->assertSame('outfit', $resolved['cover_letter_font']);

        $randomResolved = CoverLetterDesignSettings::resolveForGeneration('random', 'random');
        $this->assertContains($randomResolved['cover_letter_design'], CoverLetterDesignSettings::designKeys());
        $this->assertContains($randomResolved['cover_letter_font'], CoverLetterDesignSettings::fontKeys());
        $this->assertSame('random', $randomResolved['design_preference']);
        $this->assertSame('random', $randomResolved['font_preference']);
    }

    public function test_cover_letter_document_save_uses_design_settings(): void
    {
        $user = User::factory()->create();
        $user->cvProfile()->create([
            'parsing_complete' => true,
            'full_name' => 'Jamie Lee',
            'email' => 'jamie@example.com',
            'cover_letter_design' => 'geometric-mark',
            'cover_letter_font' => 'ibm-plex-sans',
        ]);

        $response = $this->actingAs($user)
            ->postJson(route('api.profile.cover-letters.store'), [
                'job' => [
                    'title' => 'Backend Engineer',
                    'company' => 'Northwind',
                    'link' => 'https://example.com/jobs/1',
                ],
                'text' => "Dear Hiring Manager,\n\nPlease find my application.\n\nYours sincerely,\nJamie Lee",
            ]);

        $response->assertCreated()
            ->assertJsonPath('saved', true);

        $document = $user->profileDocuments()->first();
        $this->assertNotNull($document);
        $bytes = Storage::disk('local')->get($document->stored_path);
        $this->assertStringContainsString('/CoverLetterDesign (geometric-mark)', $bytes);
        $this->assertStringContainsString('/CoverLetterFont (ibm-plex-sans)', $bytes);
    }
}
