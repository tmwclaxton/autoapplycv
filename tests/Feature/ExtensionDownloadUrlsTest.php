<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExtensionDownloadUrlsTest extends TestCase
{
    public function test_extension_config_version_matches_manifest(): void
    {
        $manifest = json_decode(
            (string) file_get_contents(base_path('extension/manifest.json')),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        $this->assertIsArray($manifest);
        $this->assertIsString($manifest['version'] ?? null);
        $this->assertSame($manifest['version'], config('extension.version'));
    }

    public function test_frontend_download_urls_include_manifest_version_query(): void
    {
        $version = (string) config('extension.version');
        $source = (string) file_get_contents(resource_path('js/lib/extensionDownloads.ts'));

        $this->assertStringContainsString("from '../../../extension/manifest.json'", $source);
        $this->assertStringContainsString('versionedExtensionZip', $source);
        $this->assertStringContainsString('/extension/autoapplycv-chrome.zip', $source);
        $this->assertStringContainsString('/extension/autoapplycv-firefox.zip', $source);
        $this->assertStringContainsString('FIREFOX_ADDONS_URL', $source);
        $this->assertStringContainsString('firefoxAddons:', $source);
        $this->assertNotSame('', $version);
        $this->assertMatchesRegularExpression('/\d+\.\d+\.\d+/', $version);
    }

    public function test_download_panel_labels_distinguish_chrome_and_firefox_zips(): void
    {
        $source = (string) file_get_contents(
            resource_path('js/components/extension/ExtensionDownloadPanel.vue'),
        );

        $this->assertStringContainsString("return 'autoapplycv-chrome.zip'", $source);
        $this->assertStringContainsString("return 'autoapplycv-firefox.zip'", $source);
        $this->assertStringContainsString(':download="downloadFilename"', $source);
        $this->assertStringContainsString('do not upload the Chrome zip to AMO', $source);
        $this->assertStringContainsString('Install from Firefox Add-ons', $source);
        $this->assertStringContainsString('extensionDownloads.firefoxAddons', $source);
    }

    public function test_site_exports_chrome_and_firefox_store_urls(): void
    {
        $source = (string) file_get_contents(resource_path('js/lib/site.ts'));

        $this->assertStringContainsString(
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
            $source,
        );
        $this->assertStringContainsString(
            'https://addons.mozilla.org/en-GB/firefox/addon/autocvapply/',
            $source,
        );
    }

    public function test_welcome_page_links_chrome_and_firefox_store_listings(): void
    {
        $source = (string) file_get_contents(resource_path('js/pages/Welcome.vue'));

        $this->assertStringContainsString('CHROME_WEB_STORE_URL', $source);
        $this->assertStringContainsString('FIREFOX_ADDONS_URL', $source);
        $this->assertStringContainsString('Chrome Web Store', $source);
        $this->assertStringContainsString('Firefox Add-ons', $source);
        $this->assertStringContainsString('<Chrome', $source);
        $this->assertStringContainsString("['fab', 'firefox-browser']", $source);
    }

    public function test_nginx_sets_no_cache_headers_for_extension_zips(): void
    {
        $nginx = (string) file_get_contents(base_path('docker/production/nginx.conf'));

        $this->assertStringContainsString('^/extension/.*\\.zip$', $nginx);
        $this->assertStringContainsString('Cache-Control "no-cache, must-revalidate"', $nginx);
    }
}
