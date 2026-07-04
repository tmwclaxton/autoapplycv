import { readFilePayload, triggerBrowserDownload } from './file-transfer.js';
import {
    cvAcceptAttribute,
    documentAcceptAttribute,
    validateCvUpload,
    validateDocumentUpload,
} from '../shared/upload-validation.js';

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

    const defaultCategories = [
        { value: 'cv', label: 'CV / Résumé' },
        { value: 'certificate', label: 'Certificate / Qualification' },
        { value: 'transcript', label: 'Transcript' },
        { value: 'reference', label: 'Reference letter' },
        { value: 'portfolio', label: 'Portfolio / Work sample' },
        { value: 'other', label: 'Other' },
    ];

    let documents = [];
    let categories = [...defaultCategories];
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

        if (fileInput) {
            fileInput.accept = categorySelect.value === 'cv'
                ? cvAcceptAttribute()
                : documentAcceptAttribute();
        }
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

        for (const doc of documents) {
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

            item.querySelector('.document-item-title').textContent = doc.title;
            item.querySelector('.document-item-meta').textContent = `${doc.category_label} · ${doc.file_size_label}`;

            item.querySelector('.document-download-btn').addEventListener('click', () => {
                downloadDocument(doc.id);
            });

            item.querySelector('.document-delete-btn').addEventListener('click', () => {
                deleteDocument(doc);
            });

            if (deletingId === doc.id) {
                item.querySelector('.document-delete-btn').disabled = true;
                item.querySelector('.document-delete-btn').textContent = 'Deleting…';
            }

            listEl.appendChild(item);
        }
    }

    async function refreshDocuments({ force = false } = {}) {
        const profileData = await loadProfile({ force });

        if (profileData?.error) {
            throw new Error(profileData.error);
        }

        documents = Array.isArray(profileData?.documents) ? profileData.documents : [];
        categories = Array.isArray(profileData?.document_categories) && profileData.document_categories.length > 0
            ? profileData.document_categories
            : defaultCategories;
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

    async function deleteDocument(doc) {
        const label = doc.category === 'cv' ? 'this CV file' : `"${doc.title}"`;

        if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
            return;
        }

        deletingId = doc.id;
        renderDocuments();
        uploadStatus.textContent = 'Deleting file…';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'DELETE_PROFILE_DOCUMENT',
                documentId: doc.id,
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

        const validationError = categorySelect.value === 'cv'
            ? validateCvUpload({ fileName: file.name, mimeType: file.type })
            : validateDocumentUpload({ fileName: file.name, mimeType: file.type });

        if (validationError) {
            uploadStatus.textContent = validationError;
            showMessage(validationError, 'error');

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

    renderCategories();

    return {
        refreshDocuments,
    };
}
