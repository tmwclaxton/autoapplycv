/**
 * Auto Apply role/search query helpers.
 * Search must use the user-entered job-role filter only - never profile name,
 * LinkedIn-style headline, or education metadata.
 */

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readProfileFullName(profileData) {
    return String(
        profileData?.profile?.full_name
        || profileData?.full_name
        || profileData?.user?.name
        || '',
    ).trim();
}

function splitNameParts(fullName) {
    return String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * True when text is education / profile fluff, not a job-search role.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isNonJobSearchRoleDescription(value) {
    const role = String(value || '').trim();

    if (!role) {
        return true;
    }

    // Lone slash / punctuation leftovers from bad autofill.
    if (/^[\\/|·•\u2013\u2014\s]+$/.test(role)) {
        return true;
    }

    if (/russell\s*group/i.test(role)) {
        return true;
    }

    // Education-only blurbs (allow titles that still name a job).
    if (
        /\b(university|college|undergraduate|postgraduate|bachelor'?s|master'?s|a-?levels?|gcse|ib\b|sixth\s+form)\b/i.test(role)
        && !/\b(engineer|developer|designer|manager|analyst|scientist|teacher|lecturer|tutor|researcher|nurse|consultant|accountant|lawyer|solicitor|architect|recruiter|sales|product|ops|operations|support|admin|assistant|intern|apprentice)\b/i.test(role)
    ) {
        return true;
    }

    return false;
}

/**
 * Remove candidate name / education / headline pollution from a role search query.
 *
 * @param {string} roleDescription
 * @param {object|null|undefined} profileData
 * @returns {string}
 */
export function sanitizeAutoApplyRoleDescription(roleDescription, profileData = null) {
    let role = String(roleDescription || '').trim();

    if (!role || isNonJobSearchRoleDescription(role)) {
        return '';
    }

    const fullName = readProfileFullName(profileData);

    if (!fullName) {
        return role;
    }

    const nameParts = new Set([
        fullName.toLowerCase(),
        ...splitNameParts(fullName).map((part) => part.toLowerCase()),
    ]);

    const suffixPattern = new RegExp(`\\s*,\\s*${escapeRegExp(fullName)}\\s*$`, 'i');
    const prefixPattern = new RegExp(`^\\s*${escapeRegExp(fullName)}\\s*,\\s*`, 'i');

    role = role.replace(suffixPattern, '').trim();
    role = role.replace(prefixPattern, '').trim();

    if (!role || isNonJobSearchRoleDescription(role) || nameParts.has(role.toLowerCase())) {
        return '';
    }

    const segments = role
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => !nameParts.has(segment.toLowerCase()))
        .filter((segment) => !isNonJobSearchRoleDescription(segment));

    return segments.join(', ').trim();
}

/**
 * @param {string} roleDescription
 * @param {object|null|undefined} profileData
 * @returns {string}
 */
export function buildSanitizedJobSearchUrl(buildUrl, roleDescription, profileData = null, options = null) {
    const sanitizedRole = sanitizeAutoApplyRoleDescription(roleDescription, profileData);

    if (!sanitizedRole) {
        throw new Error('Role description is required.');
    }

    return buildUrl(sanitizedRole, options || undefined);
}
