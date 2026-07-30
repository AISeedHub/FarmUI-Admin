// ── display_names (multi-language labels) ────────────────────────────────
// Every "Display Names (JSON)" field in the admin UI is edited as raw JSON text.
// The textarea opens pre-filled with the language keys already in place, so writing
// a translation is "type the value" instead of "remember the shape".

// Locales the admin UI itself ships (see src/i18n.ts). These keys are always offered.
export const DISPLAY_NAME_LANGS = ['en', 'ko'] as const;

// Text to seed a textarea with. Values a record already has are kept — including
// languages outside DISPLAY_NAME_LANGS (e.g. an existing "vi") — and the shipped
// locales are always present, so a missing translation is visible rather than
// forgotten. Key order: shipped locales first, then any extras.
export const displayNamesToText = (dn?: Record<string, string> | null): string => {
    const merged: Record<string, string> = {};
    DISPLAY_NAME_LANGS.forEach(lang => { merged[lang] = ''; });
    Object.entries(dn || {}).forEach(([lang, value]) => {
        merged[lang] = typeof value === 'string' ? value : String(value ?? '');
    });
    return JSON.stringify(merged, null, 2);
};

// Blank scaffold for a new record: { "en": "", "ko": "" }.
export const emptyDisplayNamesText = (): string => displayNamesToText(null);

// Reading a textarea back. `value: null` means nothing was filled in — an untouched
// scaffold must never be sent as { "en": "", "ko": "" }. `ok: false` means the text
// is not a JSON object, and the caller shows detail.invalidJson.
export type DisplayNamesParse =
    | { ok: true; value: Record<string, string> | null }
    | { ok: false };

export const parseDisplayNamesText = (text?: string): DisplayNamesParse => {
    if (!text || !text.trim()) return { ok: true, value: null };

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };

    const cleaned = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
            .map(([lang, v]) => [lang, (v as string).trim()])
    ) as Record<string, string>;

    return { ok: true, value: Object.keys(cleaned).length ? cleaned : null };
};
