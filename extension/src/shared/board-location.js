/**
 * UK job boards that put the location in the URL path (Reed, Totaljobs,
 * CV-Library) return 0 jobs for "london-england-united-kingdom"; they only
 * know the town or city. Reduce profile/LinkedIn-style locations to that.
 */

const COUNTRY_OR_NATION_SEGMENT = /^(?:united kingdom|uk|u\.k\.|great britain|gb|britain|england|scotland|wales|northern ireland|ireland|europe|emea)$/i;

/**
 * "London, England, United Kingdom" -> "London"; "Greater Manchester Area" ->
 * "Greater Manchester"; "United Kingdom" -> "" (nationwide).
 * @param {string|null|undefined} location
 * @returns {string}
 */
export function simplifyBoardSearchLocation(location) {
    const segments = String(location ?? '')
        .split(',')
        .map((segment) => segment.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    while (segments.length > 1 && COUNTRY_OR_NATION_SEGMENT.test(segments[segments.length - 1])) {
        segments.pop();
    }

    const first = segments[0] || '';

    if (!first || COUNTRY_OR_NATION_SEGMENT.test(first)) {
        return '';
    }

    return first
        .replace(/\s+(?:area|metropolitan area|region)$/i, '')
        .trim();
}
