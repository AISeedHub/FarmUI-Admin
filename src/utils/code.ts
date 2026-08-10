// ── Entity codes ─────────────────────────────────────────────────────────
// A `code` is an identity, not a label. The FarmLink gateway keys its telemetry
// payloads by device code and the backend matches readings back to a row by it, so
// rewriting a code re-identifies the device: its live data lands nowhere and the old
// code keeps arriving from the edge as a device nobody owns. Two rules follow — the
// slug has to stay wire-safe, and it may only ever be derived while CREATING.

// Code columns are not all the same width, and guessing is what made the overflow bug
// so hard to read: a value the API's own validation accepts but Postgres refuses comes
// back as an opaque network error, never a message. So each field is capped at the width
// of the table it actually writes to.

// farms · zones · devices · registers · cameras.
export const CODE_MAX_LENGTH = 50;

// The two wider columns. Kept apart rather than sharing one 100 so that widening either
// column later cannot silently move the other.
export const VIRTUAL_SENSOR_CODE_MAX_LENGTH = 100;
export const NOTIFICATION_CHANNEL_CODE_MAX_LENGTH = 100;

// Wire-safe slug: lowercase, every run of anything outside [a-z0-9] collapsed to one
// '_', no leading or trailing separator. Dropping '/' is the point — it separates MQTT
// topic levels — and so is the cap, which is what stops a name like
// "Fine Misting Actuators (Switch-type Actuator On/Off Control)" from overflowing.
export const slugifyCode = (s: string, maxLength: number = CODE_MAX_LENGTH): string =>
    s.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, maxLength)
        .replace(/_+$/, '');

// Whether Code is still the untouched slug of Name. Lets a form stop deriving the
// moment an admin types a code of their own, without tracking a "touched" flag: a
// hand-written code simply stops matching, and further edits to the name leave it be.
export const codeFollowsName = (name?: string | null, code?: string | null): boolean =>
    (code || '') === slugifyCode(name || '');
