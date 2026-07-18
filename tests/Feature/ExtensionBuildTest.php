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
        $this->assertSame('121.0', $firefoxManifest['browser_specific_settings']['gecko']['strict_min_version'] ?? null);
        $this->assertSame(['background.js'], $firefoxManifest['background']['scripts'] ?? null);
        $this->assertSame('background.js', $firefoxManifest['background']['service_worker'] ?? null);
        $this->assertSame('sidepanel.html', $firefoxManifest['sidebar_action']['default_panel'] ?? null);
        $this->assertArrayNotHasKey('side_panel', $firefoxManifest);
        $this->assertArrayNotHasKey('externally_connectable', $firefoxManifest);
        $this->assertNotContains('windows', $firefoxManifest['permissions'] ?? []);
        $this->assertNotContains('sidePanel', $firefoxManifest['permissions'] ?? []);
        $this->assertContains('tabs', $firefoxManifest['permissions'] ?? []);
        $this->assertContains('storage', $firefoxManifest['permissions'] ?? []);

        $chromeManifest = $this->readManifestFromZip($chromeZip);
        $this->assertArrayNotHasKey('browser_specific_settings', $chromeManifest);
        $this->assertArrayNotHasKey('default_popup', $chromeManifest['action'] ?? []);
        $this->assertArrayNotHasKey('scripts', $chromeManifest['background'] ?? []);
        $this->assertSame('background.js', $chromeManifest['background']['service_worker'] ?? null);
        $this->assertSame('sidepanel.html', $chromeManifest['side_panel']['default_path'] ?? null);
        $this->assertContains('windows', $chromeManifest['permissions'] ?? []);
        $this->assertContains('sidePanel', $chromeManifest['permissions'] ?? []);
        $this->assertArrayHasKey('externally_connectable', $chromeManifest);
        $this->assertSame('icons/icon32.png', $chromeManifest['icons']['32'] ?? null);
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
