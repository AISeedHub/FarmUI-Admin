import { NotificationChannel } from '../types';

// ── Notification routing ─────────────────────────────────────────────────
// A farm event goes to every ACTIVE channel of that farm whose event_types match:
// one Discord message, one @mention of its role and one log row per channel. The
// backend lets those lists overlap and leaves it to the admin, so the UI works the
// routing out itself to warn before a type is sent twice, or nowhere (logged as
// `skipped`). event_types: null = every type of the scope, including ones added
// later; [] = none; [..] = exactly those.

export type RoutableChannel = Pick<NotificationChannel, 'id' | 'name' | 'is_active' | 'event_types'>;

export const receivesType = (channel: RoutableChannel, type: string): boolean =>
    channel.is_active && (channel.event_types == null || channel.event_types.includes(type));

export interface RoutingIssues<C extends RoutableChannel> {
    duplicated: { type: string; channels: C[] }[]; // ≥ 2 channels: sent, pinged and logged once per channel
    uncovered: string[];                            // 0 channels: sent nowhere, logged as skipped
}

// `types` is the farm catalog (GET /notifications/event-types?scope=farm).
export const routingIssues = <C extends RoutableChannel>(channels: C[], types: string[]): RoutingIssues<C> => {
    const issues: RoutingIssues<C> = { duplicated: [], uncovered: [] };
    for (const type of types) {
        const receivers = channels.filter(c => receivesType(c, type));
        if (receivers.length >= 2) issues.duplicated.push({ type, channels: receivers });
        else if (receivers.length === 0) issues.uncovered.push(type);
    }
    return issues;
};

// Whether two event_types values route the same, order aside. null ("all") is only
// equal to null: it also covers types added later, so it is not the full list.
export const sameEventTypes = (a: string[] | null | undefined, b: string[] | null | undefined): boolean => {
    if (a == null || b == null) return a == null && b == null;
    return a.length === b.length && a.every(x => b.includes(x));
};
