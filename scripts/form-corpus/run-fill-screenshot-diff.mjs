#!/usr/bin/env node
import { runFillScreenshotDiff } from './lib/fill-screenshot-diff.mjs';

const live = process.argv.includes('--live');
const fixtureArg = process.argv.find((arg) => arg.startsWith('--fixture='));
const fixtureId = fixtureArg?.split('=')[1];
const thresholdArg = process.argv.find((arg) => arg.startsWith('--threshold='));
const diffThreshold = thresholdArg ? Number(thresholdArg.split('=')[1]) : undefined;

const report = await runFillScreenshotDiff({ live, fixtureId, diffThreshold });

console.log(`Fill screenshot pixel diff (${report.live ? 'live' : 'fixture'}): ${report.passed ? 'PASSED' : 'FAILED'}`);
console.log(`Pixel change: ${(report.pixelDiff.diffPercent * 100).toFixed(2)}% (threshold ${(report.pixelDiff.threshold * 100).toFixed(2)}%)`);
console.log(`Screenshots: ${report.screenshots.before} -> ${report.screenshots.after}`);

if (report.fillFailures.length > 0) {
    console.error('\nFill failures:');
    console.error(report.fillFailures.join('\n'));
}

if (!report.errorBanner.passed) {
    console.error('\nError banners detected:');
    console.error(JSON.stringify(report.errorBanner.errors, null, 2));
}

if (!report.passed) {
    process.exit(1);
}

console.log('\nPixel diff, fill, and error-banner checks passed.');
