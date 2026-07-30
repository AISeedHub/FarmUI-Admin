import { Device, Zone } from '../types';

// ── Human labels for devices ─────────────────────────────────────────────
// A farm repeats device names on purpose: every sensor group owns a "Temperature
// Sensor", "Humidity Sensor", … so a bare `device.name` is ambiguous in any picker.
// Devices carry zone_id and zones carry a name, so the zone is what disambiguates.

type Named = { display_names?: Record<string, string> | null; name?: string; code?: string };

// Label of a record that carries display_names, in the active UI language.
// Falls back: exact language → base language ("ko-KR" → "ko") → English → name → code.
export const localizedName = (rec: Named | undefined | null, lang: string): string => {
    if (!rec) return '';
    const dn = rec.display_names || undefined;
    return dn?.[lang]
        || dn?.[lang.split('-')[0]]
        || dn?.en
        || rec.name
        || rec.code
        || '';
};

// Build deviceId → "<zone> · <device>" for a whole farm at once.
// Devices with no zone fall back to `unassignedLabel`. If two devices still end up
// with the same label (same zone and same name), the device code is appended so the
// choice is never a guess.
export const buildDeviceLabels = (
    devices: Device[],
    zones: Zone[],
    lang: string,
    unassignedLabel: string,
): Record<string, string> => {
    const zoneById = Object.fromEntries(zones.map(z => [z.id, z])) as Record<string, Zone>;

    const base: Record<string, string> = {};
    devices.forEach(d => {
        const zone = d.zone_id ? zoneById[d.zone_id] : undefined;
        const zoneLabel = d.zone_id ? (localizedName(zone, lang) || unassignedLabel) : unassignedLabel;
        const deviceName = localizedName(d, lang);
        base[d.id] = zoneLabel ? `${zoneLabel} · ${deviceName}` : deviceName;
    });

    const seen: Record<string, number> = {};
    Object.values(base).forEach(label => { seen[label] = (seen[label] || 0) + 1; });

    const out: Record<string, string> = {};
    devices.forEach(d => {
        out[d.id] = seen[base[d.id]] > 1 ? `${base[d.id]} (${d.code})` : base[d.id];
    });
    return out;
};

// Sort helper so pickers group devices by zone instead of by server order.
export const byLabel = (labels: Record<string, string>) =>
    (a: { id: string }, b: { id: string }) => (labels[a.id] || '').localeCompare(labels[b.id] || '');
