// USER-FACING ERROR MAPPER (Task D2)
// Isinalin ang teknikal na error messages patungong fallback na Filipino
// bago ipakita sa user. Pure TS — walang import, walang dependency.
//
// Papel:
// 1. Kung ang error.message ay mukhang teknikal (may marker sa ibaba),
//    ibalik ang fallback — hindi naiintindihan ng user ang ganoong text.
// 2. Kung ang error.message ay nagsisimula sa isa sa mga user-safe na
//    Filipino prefix (hal. quota limit mula sa server), ibalik nang buo —
//    handa na itong ipakita.
// 3. Kung hindi alinman, ibalik ang fallback.
//
// HINDI nagla-log ng anuman dito. Ang mga catch site ang may hawak ng
// console.error (pangalan ng operasyon + error.message lang).

const TECHNICAL_MARKERS: string[] = [
    'hash',
    'payload',
    'page ID',
    'image source',
    'sanitized Page',
    'raw-image',
    'BatchEditScreen',
    'Invalid',
    'Duplicate',
    'order',
    'Server Error',
    'status ',
    'undefined',
    'Empty response',
    'Search failed',
    'request failed',
];

const USER_SAFE_PREFIXES: string[] = [
    'Abot na ang',
    'Masyadong',
    'Hindi makakonekta',
    'Walang internet',
    'Hindi mabasa ang text',
    'Hindi sapat ang text',
    'May hindi nalinis',
];

export const toUserMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof Error) || !error.message) {
        return fallback;
    }

    const message = error.message;
    const lowerMessage = message.toLowerCase();

    const isTechnical = TECHNICAL_MARKERS.some((marker) =>
        lowerMessage.includes(marker.toLowerCase())
    );

    if (isTechnical) {
        return fallback;
    }

    const isUserSafe = USER_SAFE_PREFIXES.some((prefix) =>
        message.startsWith(prefix)
    );

    if (isUserSafe) {
        return message;
    }

    return fallback;
};