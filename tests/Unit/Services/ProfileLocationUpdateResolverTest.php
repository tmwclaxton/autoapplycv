<?php

namespace Tests\Unit\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use App\Services\ProfileLocationUpdateResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class ProfileLocationUpdateResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolve_returns_smart_location_bundle_for_move_request(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'location' => 'High Wycombe, Buckinghamshire',
            'city' => 'High Wycombe',
            'country' => 'United Kingdom',
            'structured_data' => [
                'address_line_1' => '1 Old Street',
                'state_region' => 'Buckinghamshire',
            ],
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'location_fields' => [
                    'location' => 'Tewkesbury, Gloucestershire',
                    'city' => 'Tewkesbury',
                    'postcode' => null,
                    'country' => 'United Kingdom',
                    'address_line_1' => '',
                    'address_line_2' => '',
                    'state_region' => 'Gloucestershire',
                ],
                'reason' => 'Moving home to Tewkesbury.',
            ]);
        });

        $resolver = app(ProfileLocationUpdateResolver::class);

        $updates = $resolver->resolve(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my location on my profile to Tewkesbury'],
            ],
            'I will update your location to Tewkesbury and clear your old street address.',
        );

        $fields = collect($updates)->pluck('field')->all();

        $this->assertContains('location', $fields);
        $this->assertContains('city', $fields);
        $this->assertContains('structured_data.address_line_1', $fields);
        $this->assertContains('structured_data.state_region', $fields);
        $this->assertSame('Tewkesbury', collect($updates)->firstWhere('field', 'city')['value'] ?? null);
        $this->assertSame('', collect($updates)->firstWhere('field', 'structured_data.address_line_1')['value'] ?? null);
    }

    public function test_resolve_returns_empty_when_no_target_place_is_known(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $resolver = app(ProfileLocationUpdateResolver::class);

        $updates = $resolver->resolve(
            $profile,
            [
                ['role' => 'user', 'content' => 'all of the location fields'],
            ],
            'Which town should I use?',
        );

        $this->assertSame([], $updates);
    }

    public function test_resolve_uses_earlier_conversation_for_all_location_fields_follow_up(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'location' => 'High Wycombe, Buckinghamshire',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'location_fields' => [
                    'location' => 'Tewkesbury, Gloucestershire',
                    'city' => 'Tewkesbury',
                    'country' => 'United Kingdom',
                    'address_line_1' => '',
                    'state_region' => 'Gloucestershire',
                ],
                'reason' => 'Full location move.',
            ]);
        });

        $resolver = app(ProfileLocationUpdateResolver::class);

        $updates = $resolver->resolve(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my location to Tewkesbury'],
                ['role' => 'assistant', 'content' => 'I can update your location to Tewkesbury.'],
                ['role' => 'user', 'content' => 'yes update all location fields'],
            ],
            'I will update all location fields for Tewkesbury.',
        );

        $this->assertNotSame([], $updates);
        $this->assertSame('Tewkesbury', collect($updates)->firstWhere('field', 'city')['value'] ?? null);
    }

    public function test_resolve_location_field_though_uses_assistant_place(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'location_fields' => [
                    'location' => 'High Wycombe, Buckinghamshire',
                    'city' => 'High Wycombe',
                    'state_region' => 'Buckinghamshire',
                ],
                'reason' => 'Match address move.',
            ]);
        });

        $resolver = app(ProfileLocationUpdateResolver::class);

        $updates = $resolver->resolve(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my name to toby claxton and my address to 343 west wycombe road, high wycombe buckinghamshire hp124ad'],
                ['role' => 'assistant', 'content' => 'Your name will update to Toby Claxton and your address to 343 West Wycombe Road, High Wycombe, Buckinghamshire HP12 4AD.'],
                ['role' => 'user', 'content' => 'update my location field though'],
            ],
            'Your location field will update to High Wycombe, Buckinghamshire.',
        );

        $this->assertSame('High Wycombe, Buckinghamshire', collect($updates)->firstWhere('field', 'location')['value'] ?? null);
    }

    public function test_resolve_move_my_location_to_bath_has_intent(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();
        $resolver = app(ProfileLocationUpdateResolver::class);

        $this->assertTrue($resolver->hasLocationMoveIntent(
            [['role' => 'user', 'content' => 'move my location to Bath']],
            'Your location will be updated to Bath, Somerset.',
        ));
    }

    public function test_resolve_i_have_moved_to_place_has_intent(): void
    {
        $resolver = app(ProfileLocationUpdateResolver::class);

        $this->assertTrue($resolver->hasLocationMoveIntent(
            [['role' => 'user', 'content' => 'I have moved to Northvale']],
            'I will update your location fields accordingly.',
        ));
    }

    public function test_resolve_all_location_fields_too_from_address_context(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'location_fields' => [
                    'location' => 'High Wycombe, Buckinghamshire',
                    'city' => 'High Wycombe',
                    'state_region' => 'Buckinghamshire',
                ],
                'reason' => 'Align with address.',
            ]);
        });

        $resolver = app(ProfileLocationUpdateResolver::class);

        $updates = $resolver->resolve(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my address to 343 west wycombe road, high wycombe buckinghamshire hp124ad'],
                ['role' => 'assistant', 'content' => 'Your address will update to 343 West Wycombe Road, High Wycombe, Buckinghamshire HP12 4AD.'],
                ['role' => 'user', 'content' => 'update all location fields too'],
            ],
            'Your location fields will align with High Wycombe, Buckinghamshire.',
        );

        $this->assertSame('High Wycombe', collect($updates)->firstWhere('field', 'city')['value'] ?? null);
    }
}
