/**
 * Content-script global for ATS CV/resume attach (mirrors shared/cv-upload-attach.js).
 */
var AutoCVApplyCvUploadAttach = (() => {
    function findAtsDropzoneRoot(fileInput) {
        if (!fileInput?.closest) {
            return null;
        }

        return (
            fileInput.closest(
                [
                    '.file-upload',
                    '[data-allow-s3]',
                    '[aria-labelledby="upload-label-resume"]',
                    '#upload_resume_field',
                    '[data-test="resume-upload"]',
                    '[data-test="apply-with-resume-container"]',
                    'spl-dropzone',
                    'oc-resume-upload',
                    'oc-apply-with-resume',
                    '[data-role="dropzone"]',
                    '[data-ui="resume"]',
                    '.dz-clickable',
                    '.dropzone',
                ].join(', '),
            ) ||
            fileInput.parentElement ||
            null
        );
    }

    function assignFileListToInput(fileInput, file, options = {}) {
        if (!fileInput || !file) {
            return null;
        }

        const DataTransferCtor =
            options.DataTransferCtor ||
            (typeof DataTransfer !== 'undefined' ? DataTransfer : null);

        if (!DataTransferCtor) {
            return null;
        }

        const dataTransfer = new DataTransferCtor();
        dataTransfer.items.add(file);

        const view =
            options.view || fileInput.ownerDocument?.defaultView || window;
        const prototype = view.HTMLInputElement?.prototype;
        const descriptor = prototype
            ? Object.getOwnPropertyDescriptor(prototype, 'files')
            : null;

        try {
            if (descriptor?.set) {
                descriptor.set.call(fileInput, dataTransfer.files);
            } else {
                fileInput.files = dataTransfer.files;
            }
        } catch {
            try {
                Object.defineProperty(fileInput, 'files', {
                    configurable: true,
                    get: () => dataTransfer.files,
                });
            } catch {
                return null;
            }
        }

        return dataTransfer;
    }

    function tryInvokeDropzoneAddFile(fileInput, file, options = {}) {
        if (!fileInput || !file) {
            return false;
        }

        const view =
            options.view || fileInput.ownerDocument?.defaultView || window;
        const root = options.dropzoneRoot || findAtsDropzoneRoot(fileInput);
        const candidates = [
            fileInput.dropzone,
            root?.dropzone,
            root?.closest?.('.dropzone')?.dropzone,
            typeof view.Dropzone?.forElement === 'function'
                ? (() => {
                      try {
                          return view.Dropzone.forElement(fileInput);
                      } catch {
                          return null;
                      }
                  })()
                : null,
            typeof view.Dropzone?.forElement === 'function' && root
                ? (() => {
                      try {
                          return view.Dropzone.forElement(root);
                      } catch {
                          return null;
                      }
                  })()
                : null,
        ].filter(Boolean);

        for (const dz of candidates) {
            if (typeof dz.addFile === 'function') {
                try {
                    dz.addFile(file);

                    return true;
                } catch {
                    // Try the next candidate.
                }
            }
        }

        return false;
    }

    function dispatchAtsFileDropEvents(
        dropRoot,
        fileInput,
        dataTransfer,
        options = {},
    ) {
        const DragEventCtor = options.DragEventCtor || DragEvent;
        const EventCtor = options.EventCtor || Event;
        const targets = [dropRoot, fileInput].filter(Boolean);
        const seen = new Set();

        for (const target of targets) {
            if (seen.has(target)) {
                continue;
            }

            seen.add(target);

            for (const type of ['dragenter', 'dragover', 'drop']) {
                try {
                    const event = new DragEventCtor(type, {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        dataTransfer,
                    });
                    target.dispatchEvent(event);
                } catch {
                    const fallback = new EventCtor(type, {
                        bubbles: true,
                        cancelable: true,
                    });

                    try {
                        Object.defineProperty(fallback, 'dataTransfer', {
                            get: () => dataTransfer,
                        });
                    } catch {
                        // Ignore defineProperty failures in older hosts.
                    }

                    target.dispatchEvent(fallback);
                }
            }
        }
    }

    function tryInvokeGreenhouseReactFileChange(fileInput) {
        if (!fileInput) {
            return false;
        }

        const ownKeys = Object.keys(fileInput);
        const propsKey = ownKeys.find(
            (key) =>
                key.startsWith('__reactProps$') ||
                key.startsWith('__reactEventHandlers$'),
        );
        const props = propsKey ? fileInput[propsKey] : null;

        if (!props || typeof props.onChange !== 'function') {
            return false;
        }

        let fiber = null;
        const fiberKey = ownKeys.find(
            (key) =>
                key.startsWith('__reactFiber$') ||
                key.startsWith('__reactInternalInstance$'),
        );

        if (fiberKey) {
            fiber = fileInput[fiberKey];
        }

        for (let depth = 0; fiber && depth < 8; depth += 1) {
            const stateNode = fiber.stateNode;

            if (
                stateNode &&
                Object.prototype.hasOwnProperty.call(stateNode, 'uploadFile') &&
                typeof stateNode.uploadFile !== 'function'
            ) {
                return false;
            }

            const memo = fiber.memoizedProps || fiber.pendingProps;

            if (
                memo &&
                Object.prototype.hasOwnProperty.call(memo, 'uploadFile') &&
                typeof memo.uploadFile !== 'function'
            ) {
                return false;
            }

            fiber = fiber.return;
        }

        const syntheticEvent = {
            type: 'change',
            target: fileInput,
            currentTarget: fileInput,
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            preventDefault() {
                this.defaultPrevented = true;
            },
            stopPropagation() {},
            isPropagationStopped() {
                return false;
            },
            persist() {},
            nativeEvent: new Event('change', { bubbles: true }),
        };

        try {
            props.onChange(syntheticEvent);

            return true;
        } catch {
            return false;
        }
    }

    function commitAtsResumeFileAttach(fileInput, file, options = {}) {
        const EventCtor = options.EventCtor || Event;
        const dropRoot = findAtsDropzoneRoot(fileInput);
        const dataTransfer = assignFileListToInput(fileInput, file, options);
        const assigned = Boolean(
            dataTransfer && (fileInput.files?.length || 0) > 0,
        );
        const dropzoneAddFile = tryInvokeDropzoneAddFile(fileInput, file, {
            dropzoneRoot: dropRoot,
            view: options.view,
        });

        if (dataTransfer) {
            dispatchAtsFileDropEvents(
                dropRoot,
                fileInput,
                dataTransfer,
                options,
            );
        }

        const reactChange = tryInvokeGreenhouseReactFileChange(fileInput);

        fileInput.dispatchEvent(
            new EventCtor('input', { bubbles: true, composed: true }),
        );
        fileInput.dispatchEvent(
            new EventCtor('change', { bubbles: true, composed: true }),
        );

        return {
            assigned,
            dropzoneAddFile,
            reactChange,
            fileCount: fileInput.files?.length || 0,
        };
    }

    const ATS_RESUME_FILE_INPUT_SELECTORS = [
        'input[type="file"]#resume:not([disabled])',
        'input[type="file"]#candidate_resume_remote_url:not([disabled])',
        'input[type="file"].dz-hidden-input:not([disabled])',
        'input[type="file"][name="resume"]:not([disabled])',
        'input[type="file"][name="candidate.cv"]:not([disabled])',
        'input[type="file"][name="candidate[resume]"]:not([disabled])',
        'input[type="file"][data-qa="input-resume"]:not([disabled])',
        'input[type="file"][data-field-path="_systemfield_resume"]:not([disabled])',
        '[data-ui="resume"] input[type="file"]:not([disabled])',
        '[data-test="resume-upload"] input[type="file"]:not([disabled])',
        '[data-test="apply-with-resume-container"] input[type="file"]:not([disabled])',
        'spl-dropzone input[type="file"]:not([disabled])',
        'oc-resume-upload input[type="file"]:not([disabled])',
        'oc-apply-with-resume input[type="file"]:not([disabled])',
        '[aria-labelledby="upload-label-resume"] input[type="file"]:not([disabled])',
    ];

    return {
        findAtsDropzoneRoot,
        assignFileListToInput,
        tryInvokeDropzoneAddFile,
        dispatchAtsFileDropEvents,
        tryInvokeGreenhouseReactFileChange,
        commitAtsResumeFileAttach,
        ATS_RESUME_FILE_INPUT_SELECTORS,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyCvUploadAttach = AutoCVApplyCvUploadAttach;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyCvUploadAttach = AutoCVApplyCvUploadAttach;
}
