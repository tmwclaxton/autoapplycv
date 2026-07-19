import { openBlobInNewTab, readFilePayload, triggerBrowserDownload } from './file-transfer.js';
import {
    cvAcceptAttribute,
    documentAcceptAttribute,
    validateCvUpload,
    validateDocumentUpload,
} from './upload-validation.js';

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

    function formatDocumentDate(value) {
        if (!value) {
            return null;
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }

    function documentMetaLabel(doc) {
        const parts = [doc.category_label, doc.file_size_label];
        const addedOn = formatDocumentDate(doc.created_at);

        if (addedOn) {
            parts.push(addedOn);
        }

        return parts.filter(Boolean).join(' · ');
    }

    function setUploading(next) {
        uploadBtn.disabled = next;
        uploadBtn.textContent = next ? 'Uploading…' : 'Choose file';
    }

    function renderCategories() {
        if (!categorySelect) {
            return;
        }

        categorySelect.replaceChildren();

        for (const category of categories) {
            const option = document.createElement('option');
            option.value = category.value;
            option.textContent = category.label;
            categorySelect.appendChild(option);
        }

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

        listEl.replaceChildren();

        if (documents.length === 0) {
            emptyEl.hidden = false;

            return;
        }

        emptyEl.hidden = true;

        for (const doc of documents) {
            const item = document.createElement('article');
            item.className = 'document-item postbox-panel';

            const body = document.createElement('div');
            body.className = 'document-item-body';

            const title = document.createElement('strong');
            title.className = 'document-item-title';
            title.textContent = doc.title;

            const meta = document.createElement('div');
            meta.className = 'document-item-meta';
            meta.textContent = documentMetaLabel(doc);

            body.append(title, meta);

            const actions = document.createElement('div');
            actions.className = 'document-item-actions';

            if (doc.preview_url) {
                const previewButton = document.createElement('button');
                previewButton.type = 'button';
                previewButton.className = 'postbox-btn-outline document-preview-btn';
                previewButton.textContent = 'Preview';
                previewButton.addEventListener('click', () => {
                    previewDocument(doc.id);
                });
                actions.appendChild(previewButton);
            }

            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.className = 'postbox-btn-outline document-download-btn';
            downloadButton.textContent = 'Download';
            downloadButton.addEventListener('click', () => {
                downloadDocument(doc.id);
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'postbox-btn-outline document-delete-btn';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => {
                deleteDocument(doc);
            });

            actions.append(downloadButton, deleteButton);
            item.append(body, actions);

            if (deletingId === doc.id) {
                deleteButton.disabled = true;
                deleteButton.textContent = 'Deleting…';
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

    async function previewDocument(documentId) {
        uploadStatus.textContent = 'Opening preview…';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'PREVIEW_PROFILE_DOCUMENT',
                documentId,
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            openBlobInNewTab(response);
            uploadStatus.textContent = '';
            showMessage('Preview opened in a new tab.', 'success');
        } catch (error) {
            uploadStatus.textContent = error.message;
            showMessage(error.message, 'error');
        }
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
