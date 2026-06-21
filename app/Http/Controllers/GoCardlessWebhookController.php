<?php

namespace App\Http\Controllers;

use App\Services\GoCardlessService;
use GoCardlessPro\Core\Exception\InvalidSignatureException;
use GoCardlessPro\Webhook;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class GoCardlessWebhookController extends Controller
{
    public function __invoke(Request $request, GoCardlessService $goCardless): Response
    {
        $secret = config('services.gocardless.webhook_secret');

        if (empty($secret)) {
            Log::error('GoCardless webhook secret is not configured.');

            return response('Webhook secret not configured.', 500);
        }

        try {
            $events = Webhook::parse(
                $request->getContent(),
                (string) $request->header('Webhook-Signature', ''),
                $secret,
            );
        } catch (InvalidSignatureException $exception) {
            Log::warning('Invalid GoCardless webhook signature', [
                'message' => $exception->getMessage(),
            ]);

            return response('Invalid signature.', 498);
        }

        foreach ($events as $event) {
            $goCardless->handleEvent($event);
        }

        return response('OK', 200);
    }
}
