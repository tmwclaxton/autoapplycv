export const CV_UPLOAD_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp'];

export const DOCUMENT_UPLOAD_EXTENSIONS = [
    'pdf',
    'doc',
    'docx',
    'txt',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'xls',
    'xlsx',
];

const CV_UPLOAD_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
]);

const DOCUMENT_UPLOAD_MIME_TYPES = new Set([
    ...CV_UPLOAD_MIME_TYPES,
    'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const BLOCKED_EXTENSIONS = new Set([
    'exe',
    'bat',
    'cmd',
    'com',
    'msi',
    'dll',
    'scr',
    'js',
    'jar',
    'sh',
    'php',
    'zip',
    'rar',
    '7z',
    'gz',
    'tar',
]);

export const CV_UPLOAD_ERROR = 'Upload a PDF, Word document, plain text, or CV image (.pdf, .doc, .docx, .txt, .png, .jpg, .jpeg, .webp). Spreadsheets and executables are not accepted for CVs.';

export const DOCUMENT_UPLOAD_ERROR = 'Upload a PDF, Word document, image, spreadsheet, or plain text file (.pdf, .doc, .docx, .txt, .png, .jpg, .jpeg, .webp, .gif, .xls, .xlsx). Executables and archives are not accepted.';

function extensionFromFileName(fileName) {
    const match = /\.([^.]+)$/i.exec(String(fileName ?? '').trim());

    return match ? match[1].toLowerCase() : '';
}

function isBlockedExtension(extension) {
    return extension !== '' && BLOCKED_EXTENSIONS.has(extension);
}

function extensionAllowed(extension, allowedExtensions) {
    return extension !== '' && allowedExtensions.includes(extension);
}

function mimeAllowed(mimeType, allowedMimeTypes) {
    const normalized = String(mimeType ?? '').trim().toLowerCase();

    return normalized !== '' && normalized !== 'application/octet-stream' && allowedMimeTypes.has(normalized);
}

function validateUpload({ fileName, mimeType }, allowedExtensions, allowedMimeTypes, errorMessage) {
    const extension = extensionFromFileName(fileName);

    if (isBlockedExtension(extension)) {
        return errorMessage;
    }

    if (extensionAllowed(extension, allowedExtensions)) {
        return null;
    }

    if (mimeAllowed(mimeType, allowedMimeTypes)) {
        return null;
    }

    return errorMessage;
}

export function validateCvUpload({ fileName, mimeType }) {
    return validateUpload(
        { fileName, mimeType },
        CV_UPLOAD_EXTENSIONS,
        CV_UPLOAD_MIME_TYPES,
        CV_UPLOAD_ERROR,
    );
}

export function validateDocumentUpload({ fileName, mimeType }) {
    return validateUpload(
        { fileName, mimeType },
        DOCUMENT_UPLOAD_EXTENSIONS,
        DOCUMENT_UPLOAD_MIME_TYPES,
        DOCUMENT_UPLOAD_ERROR,
    );
}

export function acceptAttributeForExtensions(extensions) {
    return extensions.map((extension) => `.${extension}`).join(',');
}

export function cvAcceptAttribute() {
    return acceptAttributeForExtensions(CV_UPLOAD_EXTENSIONS);
}

export function documentAcceptAttribute() {
    return acceptAttributeForExtensions(DOCUMENT_UPLOAD_EXTENSIONS);
}
