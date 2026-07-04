import { runFillScreenshotTest } from './lib/fill-screenshot-runner.mjs';

const live = process.argv.includes('--live');
const fixtureArg = process.argv.find((arg) => arg.startsWith('--fixture='));
const fixtureId = fixtureArg?.split('=')[1];

const report = await runFillScreenshotTest({ live, fixtureId });

console.log(`Fill screenshot OCR test (${report.live ? 'live' : 'fixture'}): ${report.passed ? 'PASSED' : 'FAILED'}`);
console.log(`Screenshots: ${report.screenshots.before} -> ${report.screenshots.after}`);
console.log(`OCR engine: ${report.ocrEngine.before}`);
console.log('\nOCR expectations:');
console.log(report.ocrComparison.summary);

if (report.domFailures.length > 0) {
    console.error('\nDOM failures:');
    console.error(report.domFailures.join('\n'));
}

if (!report.passed) {
    console.error('\nOCR diff sample (tokens only in after):');
    console.error(report.ocrComparison.diff.onlyInAfter.slice(0, 20).join(', ') || '(none)');
    process.exit(1);
}

console.log('\nAll OCR and DOM checks passed.');
