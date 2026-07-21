<?php

namespace App\Http\Controllers;

use App\Services\SitemapGenerator;
use Illuminate\Http\Response;

class SitemapController extends Controller
{
    public function __construct(
        private readonly SitemapGenerator $sitemap,
    ) {}

    public function sitemap(): Response
    {
        return response($this->sitemap->xml(), 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
        ]);
    }

    public function robots(): Response
    {
        return response($this->sitemap->robotsTxt(), 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
        ]);
    }
}
