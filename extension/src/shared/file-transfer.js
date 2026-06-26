export function base64ToBlob(base64, mimeType = 'application/octet-stream') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
}

export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let index = 0; index < bytes.length; index++) {
        binary += String.fromCharCode(bytes[index]);
    }

    return btoa(binary);
}

export function readFilePayload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const base64 = result.includes(',') ? result.split(',')[1] : result;

            resolve({
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                base64,
            });
        };

        reader.onerror = () => reject(new Error('Could not read the selected file.'));
        reader.readAsDataURL(file);
    });
}

export function triggerBrowserDownload({ base64, fileName, mimeType }) {
    const blob = base64ToBlob(base64, mimeType);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}
