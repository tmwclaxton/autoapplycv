import http from 'node:http';

/**
 * @param {Record<string, {
 *   jobContext: Record<string, unknown>,
 *   inventory: Record<string, unknown>,
 *   draftAll: string,
 *   profile: Record<string, unknown>,
 * }>} mocksByScenario
 * @param {Record<string, string>} [htmlByScenario]
 */
export function startE2eMockServer(mocksByScenario, htmlByScenario = {}) {
    const activeScenario = { id: null };

    const server = http.createServer((request, response) => {
        if (request.method === 'OPTIONS') {
            response.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
            });
            response.end();

            return;
        }

        const url = new URL(request.url || '/', 'http://127.0.0.1');
        const scenarioId = activeScenario.id;
        const mocks = scenarioId ? mocksByScenario[scenarioId] : null;

        const sendJson = (status, body) => {
            response.writeHead(status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(JSON.stringify(body));
        };

        const fixtureMatch = url.pathname.match(/^\/fixture\/([^/]+)$/);

        if (fixtureMatch && request.method === 'GET') {
            const fixtureId = decodeURIComponent(fixtureMatch[1]);
            const html = htmlByScenario[fixtureId];

            if (!html) {
                sendJson(404, { error: `Missing fixture HTML for ${fixtureId}.` });

                return;
            }

            response.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(html);

            return;
        }

        if (!mocks) {
            sendJson(404, { error: 'No active E2E scenario mock.' });

            return;
        }

        if (url.pathname === '/api/profile' && request.method === 'GET') {
            const profile = structuredClone(mocks.profile);
            const host = request.headers.host || url.host;
            profile.documents = [
                {
                    id: 'e2e-cv',
                    category: 'cv',
                    title: 'E2E CV',
                    original_filename: 'e2e-cv.pdf',
                    mime_type: 'application/pdf',
                    download_url: `http://${host}/api/e2e/cv.pdf`,
                },
            ];

            sendJson(200, profile);

            return;
        }

        if (url.pathname === '/api/e2e/cv.pdf' && request.method === 'GET') {
            const pdf = Buffer.from(
                'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdPj4KZW5kb2JqCnhyZWYKMCAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNC9Sb290IDEgMCBSL0luZm8gNCAwIFI+PgpzdGFydHhrefQplDYwIDAgNjEyIDc5MiB9CmVuZG9iago0IDAgb2JqCjw8L1Byb2R1Y2VyIChBdXRvQ1ZBcHBseSBFMkUpPj4KZW5kb2JqCnhyZWYK',
                'base64',
            );

            response.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(pdf);

            return;
        }

        if (url.pathname === '/api/autofill' && request.method === 'POST') {
            sendJson(200, { success: true, subscription: mocks.profile.subscription });

            return;
        }

        if (url.pathname === '/api/applications/assist/job-context' && request.method === 'POST') {
            sendJson(200, mocks.jobContext);

            return;
        }

        if (url.pathname === '/api/applications/assist/inventory' && request.method === 'POST') {
            sendJson(200, mocks.inventory);

            return;
        }

        if (url.pathname === '/api/applications/assist/draft-all' && request.method === 'POST') {
            response.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Access-Control-Allow-Origin': '*',
            });
            response.end(mocks.draftAll);

            return;
        }

        sendJson(404, { error: `Unhandled mock route: ${request.method} ${url.pathname}` });
    });

    return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();

            if (!address || typeof address === 'string') {
                reject(new Error('Failed to bind E2E mock server.'));

                return;
            }

            const apiBase = `http://127.0.0.1:${address.port}`;

            resolve({
                apiBase,
                fixtureUrl(id) {
                    return `${apiBase}/fixture/${encodeURIComponent(id)}`;
                },
                setScenario(id) {
                    activeScenario.id = id;
                },
                async close() {
                    await new Promise((closeResolve) => server.close(closeResolve));
                },
            });
        });
    });
}

export function usesLocalFixtureUrl(scenario) {
    const pageUrl = scenario.page_url || '';

    return pageUrl.includes('example.test') || scenario.id.startsWith('syn-') || scenario.id.startsWith('web-');
}
