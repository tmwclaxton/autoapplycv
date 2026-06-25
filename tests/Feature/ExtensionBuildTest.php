<?php

namespace Tests\Feature;

use Tests\TestCase;
use ZipArchive;

class ExtensionBuildTest extends TestCase
{
    public function test_extension_build_produces_chrome_and_firefox_download_zips(): void
    {
        $root = base_path();
        $result = 0;
        $output = [];
        exec('node scripts/build-extension.mjs 2>&1', $output, $result);

        $this->assertSame(0, $result, implode("\n", $output));

        $chromeZip = public_path('extension/autoapplycv-chrome.zip');
        $firefoxZip = public_path('extension/autoapplycv-firefox.zip');
        $legacyZip = public_path('extension/autoapplycv.zip');

        $this->assertFileExists($chromeZip);
        $this->assertFileExists($firefoxZip);
        $this->assertFileExists($legacyZip);

        $firefoxManifest = $this->readManifestFromZip($firefoxZip);
        $this->assertSame(
            'autocvapply@autocvapply.com',
            $firefoxManifest['browser_specific_settings']['gecko']['id'] ?? null,
        );

        $chromeManifest = $this->readManifestFromZip($chromeZip);
        $this->assertArrayNotHasKey('browser_specific_settings', $chromeManifest);
    }

    /**
     * @return array<string, mixed>
     */
    private function readManifestFromZip(string $path): array
    {
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path));

        $manifest = $zip->getFromName('manifest.json');
        $zip->close();

        $this->assertIsString($manifest);

        return json_decode($manifest, true, flags: JSON_THROW_ON_ERROR);
    }
}
