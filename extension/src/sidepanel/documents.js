import { readFilePayload, triggerBrowserDownload } from './file-transfer.js';

export function initDocumentsPanel({
    showMessage,
    loadProfile,
    onProfileUpdated,
}) {
    const categorySelect = document.getElementById('documents-category');
    const titleInput = document.getElementById('documents-title');
    const notesInput = document.getElementById('documents-notes');
    const fileInput = document.getElementById('documents-file-input');
    const uploadBtn = document.getElementById('documents-upload-btn');
    const uploadStatus = document.getElementById('documents-upload-status');
    const listEl = document.getElementById('documents-list');
    const emptyEl = document.getElementById('documents-empty');
    const cvHint = document.getElementById('documents-cv-hint');

    let documents = [];
    let categories = [];
    let deletingId = null;
    let uploading = false;

    function setUploading(next) {
        uploading = next;
        uploadBtn.disabled = next;
        uploadBtn.textContent = next ? 'Uploading…' : 'Choose file';
    }

    function renderCategories() {
        if (!categorySelect) {
            return;
        }

        categorySelect.innerHTML = categories.map((category) => (
            `<option value="${category.value}">${category.label}</option>`
        )).join('');

        if (!categorySelect.value && categories.length > 0) {
            categorySelect.value = categories[0].value;
        }

        updateCvHint();
    }

    function updateCvHint() {
        if (!cvHint) {
            return;
        }

        cvHint.hidden = categorySelect.value !== 'cv';
    }

    function renderDocuments() {
        if (!listEl || !emptyEl) {
            return;
        }

        listEl.innerHTML = '';

        if (documents.length === 0) {
            emptyEl.hidden = false;

            return;
        }

        emptyEl.hidden = true;

        for (const document of documents) {
            const item = document.createElement('article');
            item.className = 'document-item postbox-panel';
            item.innerHTML = `
                <div class="document-item-body">
                    <strong class="document-item-title"></strong>
                    <div class="document-item-meta"></div>
                </div>
                <div class="document-item-actions">
                    <button type="button" class="postbox-btn-outline document-download-btn">Download</button>
                    <button type="button" class="postbox-btn-outline document-delete-btn">Delete</button>
                </div>
            `;

            item.querySelector('.document-item-title').textContent = document.title;
            item.querySelector('.document-item-meta').textContent = `${document.category_label} · ${document.file_size_label}`;

            item.querySelector('.document-download-btn').addEventListener('click', () => {
                downloadDocument(document.id);
            });

            item.querySelector('.document-delete-btn').addEventListener('click', () => {
                deleteDocument(document);
            });

            if (deletingId === document.id) {
                item.querySelector('.document-delete-btn').disabled = true;
                item.querySelector('.document-delete-btn').textContent = 'Deleting…';
            }

            listEl.appendChild(item);
        }
    }

    async function refreshDocuments() {
        const profileData = await loadProfile();
        documents = profileData?.documents || [];
        categories = profileData?.document_categories || categories;
        renderCategories();
        renderDocuments();

        return profileData;
    }

    async function downloadDocument(documentId) {
        uploadStatus.textContent = 'Preparing download…';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'DOWNLOAD_PROFILE_DOCUMENT',
                documentId,
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            triggerBrowserDownload(response);
            uploadStatus.textContent = '';
            showMessage('Download started.', 'success');
        } catch (error) {
            uploadStatus.textContent = error.message;
            showMessage(error.message, 'error');
        }
    }

    async function deleteDocument(document) {
        const label = document.category === 'cv' ? 'this CV file' : `"${document.title}"`;

        if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
            return;
        }

        deletingId = document.id;
        renderDocuments();
        uploadStatus.textContent = 'Deleting file…';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'DELETE_PROFILE_DOCUMENT',
                documentId: document.id,
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            await refreshDocuments();
            uploadStatus.textContent = '';
            showMessage('File deleted.', 'success');
        } catch (error) {
            uploadStatus.textContent = error.message;
            showMessage(error.message, 'error');
        } finally {
            deletingId = null;
            renderDocuments();
        }
    }

    async function handleFileSelected(event) {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setUploading(true);
        uploadStatus.textContent = categorySelect.value === 'cv'
            ? 'Uploading CV and refreshing your profile…'
            : 'Uploading document…';

        try {
            const payload = await readFilePayload(file);

            if (categorySelect.value === 'cv') {
                const response = await chrome.runtime.sendMessage({
                    type: 'UPLOAD_CV',
                    file: payload,
                });

                if (response?.error) {
                    throw new Error(response.error);
                }

                if (response?.warning) {
                    showMessage(response.warning, 'error');
                } else {
                    showMessage('CV uploaded and profile updated.', 'success');
                }

                const profileData = await refreshDocuments();
                onProfileUpdated(profileData);
            } else {
                const response = await chrome.runtime.sendMessage({
                    type: 'UPLOAD_PROFILE_DOCUMENT',
                    file: payload,
                    category: categorySelect.value,
                    title: titleInput.value,
                    notes: notesInput.value,
                });

                if (response?.error) {
                    throw new Error(response.error);
                }

                titleInput.value = '';
                notesInput.value = '';
                await refreshDocuments();
                uploadStatus.textContent = '';
                showMessage('Document uploaded.', 'success');
            }
        } catch (error) {
            uploadStatus.textContent = error.message;
            showMessage(error.message, 'error');
        } finally {
            setUploading(false);

            if (categorySelect.value === 'cv') {
                uploadStatus.textContent = '';
            }
        }
    }

    categorySelect?.addEventListener('change', updateCvHint);
    uploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', handleFileSelected);

    return {
        refreshDocuments,
    };
}
