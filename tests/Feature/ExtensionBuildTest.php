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
            'autocvapply-amo@autocvapply.com',
            $firefoxManifest['browser_specific_settings']['gecko']['id'] ?? null,
        );
        $this->assertSame('140.0', $firefoxManifest['browser_specific_settings']['gecko']['strict_min_version'] ?? null);
        $this->assertSame(
            '142.0',
            $firefoxManifest['browser_specific_settings']['gecko_android']['strict_min_version'] ?? null,
        );
        $this->assertSame(
            [
                'authenticationInfo',
                'personallyIdentifyingInfo',
                'websiteContent',
                'browsingActivity',
            ],
            $firefoxManifest['browser_specific_settings']['gecko']['data_collection_permissions']['required'] ?? null,
        );
        $this->assertArrayNotHasKey(
            'optional',
            $firefoxManifest['browser_specific_settings']['gecko']['data_collection_permissions'] ?? [],
        );
        $this->assertSame(['background.js'], $firefoxManifest['background']['scripts'] ?? null);
        $this->assertSame('module', $firefoxManifest['background']['type'] ?? null);
        $this->assertArrayNotHasKey('service_worker', $firefoxManifest['background'] ?? []);
        $this->assertSame('sidepanel.html', $firefoxManifest['sidebar_action']['default_panel'] ?? null);
        $this->assertSame('AutoCVApply', $firefoxManifest['sidebar_action']['default_title'] ?? null);
        $this->assertSame('icons/icon32.png', $firefoxManifest['sidebar_action']['default_icon']['32'] ?? null);
        $this->assertSame('icons/icon32.png', $firefoxManifest['action']['default_icon']['32'] ?? null);
        $this->assertArrayNotHasKey('side_panel', $firefoxManifest);
        $this->assertArrayNotHasKey('externally_connectable', $firefoxManifest);
        $this->assertNotContains('windows', $firefoxManifest['permissions'] ?? []);
        $this->assertNotContains('sidePanel', $firefoxManifest['permissions'] ?? []);
        $this->assertContains('tabs', $firefoxManifest['permissions'] ?? []);
        $this->assertContains('storage', $firefoxManifest['permissions'] ?? []);
        $sidePanelApiPattern = '/(?:chrome|browser)\s*\??\s*\.\s*sidePanel\b/';
        $this->assertDoesNotMatchRegularExpression(
            $sidePanelApiPattern,
            $this->readZipEntry($firefoxZip, 'browser-panel.js'),
        );
        $this->assertDoesNotMatchRegularExpression(
            $sidePanelApiPattern,
            $this->readZipEntry($firefoxZip, 'background.js'),
        );
        $this->assertDoesNotMatchRegularExpression(
            $sidePanelApiPattern,
            $this->readZipEntry($firefoxZip, 'auto-apply-orchestrator.js'),
        );
        $this->assertStringContainsString(
            'sidebarAction',
            $this->readZipEntry($firefoxZip, 'browser-panel.js'),
        );

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
        $this->assertMatchesRegularExpression(
            $sidePanelApiPattern,
            $this->readZipEntry($chromeZip, 'browser-panel.js'),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function readManifestFromZip(string $path): array
    {
        return json_decode($this->readZipEntry($path, 'manifest.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    private function readZipEntry(string $path, string $name): string
    {
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path));

        $contents = $zip->getFromName($name);
        $zip->close();

        $this->assertIsString($contents);

        return $contents;
    }
}
