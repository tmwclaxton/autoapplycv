<?php

namespace Tests\Support;

/**
 * Fictional, anonymised values for assist chat scenario tests.
 */
final class AssistChatFixtures
{
    public const PERSON = 'Alex Morgan';

    public const PERSON_LOWER = 'alex morgan';

    public const NAME_JORDAN = 'Jordan Lee';

    public const NAME_JORDAN_PARTIAL = 'Jordan';

    public const NAME_SAM = 'Sam Taylor';

    public const NAME_SAM_TYPo = 'sam tayl';

    public const NAME_CASEY = 'Casey Brooks';

    public const NAME_RILEY = 'Riley O\'Neill';

    public const TOWN_PRIMARY = 'Northvale';

    public const COUNTY_PRIMARY = 'Derbyshire';

    public const LOCATION_PRIMARY = 'Northvale, Derbyshire';

    public const TOWN_SECONDARY = 'Millfield';

    public const COUNTY_SECONDARY = 'Cumbria';

    public const LOCATION_SECONDARY = 'Millfield, Cumbria';

    public const TOWN_HARBOR = 'Harborford';

    public const COUNTY_HARBOR = 'Wiltshire';

    public const LOCATION_HARBOR = 'Harborford, Wiltshire';

    public const CITY_SOUTH = 'Southford';

    public const CITY_NORTH = 'Northford';

    public const CITY_EAST = 'Eastwick';

    public const ADDRESS_RAW = '12 example street';

    public const ADDRESS_LINE = '12 Example Street';

    public const ADDRESS_FULL_RAW = '12 example street, northvale derbyshire ex124ab';

    public const ADDRESS_FULL_FORMATTED = '12 Example Street, Northvale, Derbyshire EX12 4AB';

    public const POSTCODE_RAW = 'ex12 4ab';

    public const POSTCODE_FORMATTED = 'EX12 4AB';

    public const EMAIL = 'alex@example.com';

    public const MOCK_KEY_PRIMARY = 'northvale';

    public const MOCK_KEY_SECONDARY = 'millfield';

    public const MOCK_KEY_HARBOR = 'harborford';

    public const MOCK_KEY_NORTH = 'northford';

    public const MOCK_KEY_SOUTH = 'southford';

    public const MOCK_KEY_EAST = 'eastwick';

    /**
     * @return array{location: string, city: string, state_region: string, reason: string}
     */
    public static function primaryLocationMock(): array
    {
        return [
            'location' => self::LOCATION_PRIMARY,
            'city' => self::TOWN_PRIMARY,
            'state_region' => self::COUNTY_PRIMARY,
            'reason' => 'Move to '.self::TOWN_PRIMARY.'.',
        ];
    }

    /**
     * @return array{location: string, city: string, state_region: string, reason: string}
     */
    public static function secondaryLocationMock(): array
    {
        return [
            'location' => self::LOCATION_SECONDARY,
            'city' => self::TOWN_SECONDARY,
            'state_region' => self::COUNTY_SECONDARY,
            'reason' => 'Move to '.self::TOWN_SECONDARY.'.',
        ];
    }

    /**
     * @return array{location: string, city: string, state_region: string, reason: string}
     */
    public static function harborLocationMock(): array
    {
        return [
            'location' => self::LOCATION_HARBOR,
            'city' => self::TOWN_HARBOR,
            'state_region' => self::COUNTY_HARBOR,
            'reason' => 'Move to '.self::TOWN_HARBOR.'.',
        ];
    }

    /**
     * @return array{location: string, city: string, state_region: string, reason: string}
     */
    public static function northCityMock(): array
    {
        return [
            'location' => self::CITY_NORTH,
            'city' => self::CITY_NORTH,
            'state_region' => self::CITY_NORTH,
            'reason' => 'Move to '.self::CITY_NORTH.'.',
        ];
    }

    /**
     * @param  array{location: string, city: string, state_region: string, reason: string}  $mock
     * @return array{location_fields: array<string, string>, reason: string}
     */
    public static function locationFieldsPayload(array $mock): array
    {
        return [
            'location_fields' => [
                'location' => $mock['location'],
                'city' => $mock['city'],
                'state_region' => $mock['state_region'],
            ],
            'reason' => $mock['reason'],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function mockLocationResponseForPlace(string $place): ?array
    {
        $normalized = strtolower($place);

        if (str_contains($normalized, self::MOCK_KEY_PRIMARY)) {
            return self::locationFieldsPayload(self::primaryLocationMock());
        }

        if (str_contains($normalized, self::MOCK_KEY_SECONDARY)) {
            return self::locationFieldsPayload(self::secondaryLocationMock());
        }

        if (str_contains($normalized, self::MOCK_KEY_HARBOR)) {
            return self::locationFieldsPayload(self::harborLocationMock());
        }

        if (str_contains($normalized, self::MOCK_KEY_NORTH)) {
            return self::locationFieldsPayload(self::northCityMock());
        }

        if (str_contains($normalized, self::MOCK_KEY_SOUTH)) {
            return self::locationFieldsPayload([
                'location' => self::CITY_SOUTH,
                'city' => self::CITY_SOUTH,
                'state_region' => self::CITY_SOUTH,
                'reason' => 'Move to '.self::CITY_SOUTH.'.',
            ]);
        }

        if (str_contains($normalized, self::MOCK_KEY_EAST)) {
            return self::locationFieldsPayload([
                'location' => self::CITY_EAST.', UK',
                'city' => self::CITY_EAST,
                'state_region' => self::CITY_EAST,
                'reason' => 'Move to '.self::CITY_EAST.'.',
            ]);
        }

        return null;
    }
}
