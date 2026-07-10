#!/usr/bin/env node
/**
 * Live Ashby board capture smoke test via extension bridge.
 *
 * Usage:
 *   node scripts/form-corpus/run-ashby-board-live-test.mjs --board=notion
 *   node scripts/form-corpus/run-ashby-board-live-test.mjs --board=directive
 */
import { bridgeStatus } from '../extension-bridge/lib/bridge-http.mjs';
import { crawlAshbyBoard } from './lib/ashby-board-crawl.mjs';
import { ashbyBoardUrl } from './lib/ashby-board.mjs';

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function main() {
    const company = parseArg('board', 'notion');
    const jobUrl = parseArg('job-url', null);
    const boardUrl = ashbyBoardUrl(company);
    const maxPerBoard = Number(parseArg('max-per-board', '1'));

    const status = await bridgeStatus();

    if (!status.extensionConnected) {
        console.error('Extension bridge not connected.');
        process.exit(1);
    }

    if (jobUrl) {
        const { captureAshbyJobViaApplyClick } = await import(
            './lib/ashby-board-crawl.mjs'
        );
        console.log(`Live Ashby job test: ${jobUrl}`);

        const capture = await captureAshbyJobViaApplyClick(jobUrl, {
            minFields: 2,
        });

        console.log(JSON.stringify(capture, null, 2));
        process.exit(capture.status === 'accept' ? 0 : 1);
    }

    console.log(`Live Ashby test: ${boardUrl} (max ${maxPerBoard} job)`);

    const result = await crawlAshbyBoard(boardUrl, {
        maxPerBoard,
        maxAccept: maxPerBoard,
        minFields: 2,
    });

    console.log(
        JSON.stringify(
            {
                boardUrl: result.boardUrl,
                discovered: result.discoveredJobDetailUrls.length,
                tried: result.jobDetailUrls.length,
                accepted: result.accepted,
                captures: result.captures.map((capture) => ({
                    jobDetailUrl: capture.jobDetailUrl,
                    status: capture.status,
                    reason: capture.reason,
                    applyClicked: capture.applyClicked,
                    applyButtonText: capture.applyButtonText,
                    meaningfulCount: capture.meaningfulCount,
                    fieldCount: capture.fieldCount,
                    url: capture.url,
                })),
            },
            null,
            2,
        ),
    );

    if (result.accepted < 1) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
