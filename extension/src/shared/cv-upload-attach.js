/**
 * Shared ATS resume/CV attach helpers.
 *
 * Greenhouse, Teamtailor (Dropzone), and SmartRecruiters (shadow spl-dropzone)
 * need more than a bare input.files assignment + change event:
 * - pierce open shadow roots when finding the input
 * - assign via the native files setter
 * - prefer Dropzone.addFile when present (Teamtailor remote_url)
 * - dispatch drag/drop on the visible dropzone root (Greenhouse / SPL)
 */

/**
 * @param {HTMLInputElement|null|undefined} fileInput
 * @returns {Element|null}
 */
export function findAtsDropzoneRoot(fileInput) {
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

/**
 * Assign a File onto an input via the HTMLInputElement.files setter.
 *
 * @param {HTMLInputElement} fileInput
 * @param {File} file
 * @param {{
 *   DataTransferCtor?: typeof DataTransfer,
 *   view?: Window,
 * }} [options]
 * @returns {DataTransfer|null}
 */
export function assignFileListToInput(fileInput, file, options = {}) {
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
        options.view || fileInput.ownerDocument?.defaultView || globalThis;
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

/**
 * Teamtailor (and similar) Dropzone.js instances upload to S3 and fill the
 * hidden remote_url field. Native change alone leaves "Upload CV can't be blank".
 *
 * @param {HTMLInputElement} fileInput
 * @param {File} file
 * @param {{ dropzoneRoot?: Element|null, view?: Window }} [options]
 * @returns {boolean}
 */
export function tryInvokeDropzoneAddFile(fileInput, file, options = {}) {
    if (!fileInput || !file) {
        return false;
    }

    const view =
        options.view || fileInput.ownerDocument?.defaultView || globalThis;
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

/**
 * Dispatch dragenter/dragover/drop so Greenhouse file-upload and SPL dropzones
 * run their drop handlers (often more reliable than a bare change event).
 *
 * @param {Element|null} dropRoot
 * @param {HTMLInputElement} fileInput
 * @param {DataTransfer} dataTransfer
 * @param {{
 *   DragEventCtor?: typeof DragEvent,
 *   EventCtor?: typeof Event,
 * }} [options]
 */
export function dispatchAtsFileDropEvents(
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

/**
 * Greenhouse boards sometimes throw from onChange when the S3 uploader is not
 * wired (`Cannot read properties of undefined (reading 'uploadFile')`). Prefer
 * React onChange only when uploadFile / onFileChange handlers look callable.
 *
 * @param {HTMLInputElement} fileInput
 * @returns {boolean} true when a React handler was invoked
 */
export function tryInvokeGreenhouseReactFileChange(fileInput) {
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

    // Walk a few fiber parents for an uploadFile method - if the closest
    // owner exposes uploadFile as undefined, skip React onChange and rely on
    // drop + native change so the board does not paint the error string.
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

/**
 * Full ATS resume attach: assign files, Dropzone.addFile, drop events, change.
 *
 * @param {HTMLInputElement} fileInput
 * @param {File} file
 * @param {{
 *   DataTransferCtor?: typeof DataTransfer,
 *   DragEventCtor?: typeof DragEvent,
 *   EventCtor?: typeof Event,
 *   view?: Window,
 * }} [options]
 * @returns {{
 *   assigned: boolean,
 *   dropzoneAddFile: boolean,
 *   reactChange: boolean,
 *   fileCount: number,
 * }}
 */
export function commitAtsResumeFileAttach(fileInput, file, options = {}) {
    const EventCtor = options.EventCtor || Event;
    const dropRoot = findAtsDropzoneRoot(fileInput);
    const dataTransfer = assignFileListToInput(fileInput, file, options);
    const assigned = Boolean(dataTransfer && (fileInput.files?.length || 0) > 0);
    const dropzoneAddFile = tryInvokeDropzoneAddFile(fileInput, file, {
        dropzoneRoot: dropRoot,
        view: options.view,
    });

    if (dataTransfer) {
        dispatchAtsFileDropEvents(dropRoot, fileInput, dataTransfer, options);
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

/**
 * Preferred resume file-input selectors for Greenhouse / Teamtailor / SR.
 * Used by finders that already pierce shadow DOM.
 */
export const ATS_RESUME_FILE_INPUT_SELECTORS = [
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
