const UNICODE_TO_WIN1252 = new Map([
    [0x20AC, 0x80],
    [0x201A, 0x82],
    [0x0192, 0x83],
    [0x201E, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02C6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8A],
    [0x2039, 0x8B],
    [0x0152, 0x8C],
    [0x017D, 0x8E],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201C, 0x93],
    [0x201D, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02DC, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9A],
    [0x203A, 0x9B],
    [0x0153, 0x9C],
    [0x017E, 0x9E],
    [0x0178, 0x9F],
]);

export function normalizePdfText(text) {
    return String(text ?? '')
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ');
}

export function encodeForWinAnsiPdf(text) {
    let encoded = '';

    for (const char of normalizePdfText(text)) {
        const codePoint = char.codePointAt(0);

        if (codePoint <= 0x7F) {
            encoded += char;
            continue;
        }

        if (codePoint >= 0xA0 && codePoint <= 0xFF) {
            encoded += String.fromCharCode(codePoint);
            continue;
        }

        const win1252Byte = UNICODE_TO_WIN1252.get(codePoint);
        encoded += win1252Byte !== undefined
            ? String.fromCharCode(win1252Byte)
            : '?';
    }

    return encoded;
}
