#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    CV_UPLOAD_ERROR,
    DOCUMENT_UPLOAD_ERROR,
    validateCvUpload,
    validateDocumentUpload,
} from '../../extension/src/shared/upload-validation.js';

const cases = [
    {
        name: 'accepts CV pdf',
        fn: () => assert.equal(validateCvUpload({ fileName: 'cv.pdf', mimeType: 'application/pdf' }), null),
    },
    {
        name: 'accepts CV docx',
        fn: () => assert.equal(
            validateCvUpload({
                fileName: 'cv.docx',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            null,
        ),
    },
    {
        name: 'accepts CV txt',
        fn: () => assert.equal(validateCvUpload({ fileName: 'cv.txt', mimeType: 'text/plain' }), null),
    },
    {
        name: 'rejects CV xlsx',
        fn: () => assert.equal(
            validateCvUpload({
                fileName: 'cv.xlsx',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
            CV_UPLOAD_ERROR,
        ),
    },
    {
        name: 'rejects CV xls',
        fn: () => assert.equal(
            validateCvUpload({
                fileName: 'cv.xls',
                mimeType: 'application/vnd.ms-excel',
            }),
            CV_UPLOAD_ERROR,
        ),
    },
    {
        name: 'rejects CV exe',
        fn: () => assert.equal(validateCvUpload({ fileName: 'malware.exe', mimeType: 'application/octet-stream' }), CV_UPLOAD_ERROR),
    },
    {
        name: 'accepts document png',
        fn: () => assert.equal(validateDocumentUpload({ fileName: 'scan.png', mimeType: 'image/png' }), null),
    },
    {
        name: 'accepts document xlsx',
        fn: () => assert.equal(
            validateDocumentUpload({
                fileName: 'portfolio.xlsx',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
            null,
        ),
    },
    {
        name: 'rejects document exe',
        fn: () => assert.equal(
            validateDocumentUpload({ fileName: 'payload.exe', mimeType: 'application/octet-stream' }),
            DOCUMENT_UPLOAD_ERROR,
        ),
    },
    {
        name: 'rejects document zip',
        fn: () => assert.equal(
            validateDocumentUpload({ fileName: 'archive.zip', mimeType: 'application/zip' }),
            DOCUMENT_UPLOAD_ERROR,
        ),
    },
];

let failed = 0;

for (const testCase of cases) {
    try {
        testCase.fn();
        console.log(`ok - ${testCase.name}`);
    } catch (error) {
        failed += 1;
        console.error(`not ok - ${testCase.name}`);
        console.error(error instanceof Error ? error.message : error);
    }
}

if (failed > 0) {
    process.exit(1);
}

console.log(`\n${cases.length} upload validation checks passed.`);
