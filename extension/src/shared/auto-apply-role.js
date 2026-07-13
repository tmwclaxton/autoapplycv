/**
 * Auto Apply role/search query helpers.
 * Search must use the user-entered role filter only - never profile name.
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
 * Remove candidate name segments accidentally appended to a role search query.
 *
 * @param {string} roleDescription
 * @param {object|null|undefined} profileData
 * @returns {string}
 */
export function sanitizeAutoApplyRoleDescription(roleDescription, profileData = null) {
    let role = String(roleDescription || '').trim();

    if (!role) {
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

    if (nameParts.has(role.toLowerCase())) {
        return '';
    }

    const segments = role
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => !nameParts.has(segment.toLowerCase()));

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
