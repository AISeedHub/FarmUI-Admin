import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, RefreshCw, History, Clock, User, Zap, Cpu, Layers } from 'lucide-react';
import { automationsApi, devicesApi, zonesApi } from '../../../api/services';
import { ActuatorCommand, Device, ExecutionHistoryRow, Zone } from '../../../types';
import { buildDeviceLabels } from '../../../utils/deviceLabel';
import './PresetHistoryModal.css';

// One rule whose executions belong in this timeline. A standalone preset has a
// single source; a package has one per child rule (the container never fires).
export interface HistorySource {
    id: string;
    name: string;
}

interface PresetHistoryModalProps {
    farmId: string;
    title: string;
    description?: string | null;
    isEnabled: boolean;
    sources: HistorySource[];
    // A package merges several rules, so each entry says which rule fired.
    showRuleTag?: boolean;
    onClose: () => void;
}

// Per-rule request limit (the endpoint caps at 100) and the merged display cap.
const PER_RULE_LIMIT = 20;
const MAX_ROWS = 100;

interface Entry {
    log: ExecutionHistoryRow;
    ruleName: string;
}

// Normalized actuator write, from whichever shape the backend sent.
interface WriteRow {
    key: string;
    label: string;
    value: string;
    status: string;
    error?: string | null;
}

const timeOf = (log: ExecutionHistoryRow): number => {
    const raw = log.triggered_at || log.occurred_at;
    const ms = raw ? Date.parse(raw) : NaN;
    return Number.isNaN(ms) ? 0 : ms;
};

const writesOf = (log: ExecutionHistoryRow, deviceLabels: Record<string, string>): WriteRow[] => {
    if (log.actuator_writes?.length) {
        return log.actuator_writes.map((w, i) => ({
            key: `w${i}`,
            label: [w.device_name, w.register_code].filter(Boolean).join(' · '),
            value: String(w.value),
            status: w.status,
            error: w.error_message,
        }));
    }
    return (log.actions || []).map((a: ActuatorCommand) => ({
        key: a.id,
        // `actions` carries ids only. Labels arrive with the farm's devices; a device
        // deleted since the run keeps its short id rather than showing nothing.
        label: deviceLabels[a.device_id] || `#${a.device_id.slice(0, 8)}`,
        value: String(a.value),
        status: a.status,
        error: a.error_message,
    }));
};

export default function PresetHistoryModal({
    farmId, title, description, isEnabled, sources, showRuleTag, onClose,
}: PresetHistoryModalProps) {
    const { t, i18n } = useTranslation();

    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deviceLabels, setDeviceLabels] = useState<Record<string, string>>({});
    // Sources are rebuilt on every parent render; the fetch only ever needs the
    // latest value, never a new effect run.
    const sourcesRef = useRef(sources);
    sourcesRef.current = sources;

    const load = useCallback(async () => {
        const list = sourcesRef.current;
        if (list.length === 0) { setEntries([]); setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const perRule = await Promise.all(list.map(async src => {
                // One rule failing must not blank out the whole timeline.
                try {
                    const logs = await automationsApi.getExecutions(src.id, PER_RULE_LIMIT);
                    return logs.map(log => ({ log, ruleName: src.name }));
                } catch (err) {
                    console.warn(`Failed to load executions of ${src.id}:`, err);
                    return [] as Entry[];
                }
            }));
            const merged = perRule.flat().sort((a, b) => timeOf(b.log) - timeOf(a.log));
            setEntries(merged.slice(0, MAX_ROWS));
        } catch (err: any) {
            console.error('Failed to load preset history:', err);
            setError(err?.message || 'Failed to load history');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Device names are only worth two requests once we know a run actually wrote
    // to an actuator and came back as bare ids.
    const needsLabels = useMemo(
        () => entries.some(e => !e.log.actuator_writes?.length && (e.log.actions?.length ?? 0) > 0),
        [entries],
    );
    const labelsRequested = useRef(false);

    useEffect(() => {
        if (!needsLabels || labelsRequested.current) return;
        labelsRequested.current = true;
        let cancelled = false;
        (async () => {
            const [devs, zns] = await Promise.all([
                devicesApi.getByFarm(farmId).catch(() => [] as Device[]),
                zonesApi.getByFarm(farmId).catch(() => [] as Zone[]),
            ]);
            if (cancelled) return;
            setDeviceLabels(buildDeviceLabels(devs, zns, i18n.language, t('detail.unassigned')));
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsLabels, farmId]);

    // Day headers so a merged multi-rule stream stays readable.
    const days = useMemo(() => {
        const out: Array<{ day: string; items: Entry[] }> = [];
        entries.forEach(e => {
            const ms = timeOf(e.log);
            const day = ms ? new Date(ms).toLocaleDateString(i18n.language, {
                year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
            }) : '—';
            const last = out[out.length - 1];
            if (last && last.day === day) last.items.push(e);
            else out.push({ day, items: [e] });
        });
        return out;
    }, [entries, i18n.language]);

    return (
        <div className="ph-overlay" onClick={onClose}>
            <div className="ph-modal" onClick={e => e.stopPropagation()}>
                <div className="ph-header">
                    <div className="ph-head-text">
                        <span className="ph-eyebrow"><History size={12} /> {t('preset.historyEyebrow')}</span>
                        <div className="ph-title-row">
                            <h3 title={title}>{title}</h3>
                            <span className={`ph-badge ${isEnabled ? 'on' : 'off'}`}>
                                {isEnabled ? t('preset.enabledOn') : t('preset.enabledOff')}
                            </span>
                            {showRuleTag && (
                                <span className="ph-badge rules">
                                    <Layers size={11} /> {t('preset.pkg.ruleCount', { count: sources.length })}
                                </span>
                            )}
                        </div>
                        {description && <p className="ph-desc">{description}</p>}
                    </div>
                    <div className="ph-head-actions">
                        <button className="ph-icon-btn" onClick={load} disabled={loading} title={t('preset.historyRefresh')}>
                            <RefreshCw size={14} className={loading ? 'ph-spin' : ''} />
                        </button>
                        <button className="ph-icon-btn" onClick={onClose} title={t('preset.cancel')}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="ph-body">
                    {loading ? (
                        <div className="ph-state">
                            <Loader2 className="ph-spin" size={26} />
                            <span>{t('auto.loadingHistory')}</span>
                        </div>
                    ) : error ? (
                        <div className="ph-state">
                            <span className="ph-error-text">{t('preset.historyFailed', { error })}</span>
                            <button className="secondary-btn flex-center" onClick={load}>
                                <RefreshCw size={13} /> {t('preset.retry')}
                            </button>
                        </div>
                    ) : sources.length === 0 ? (
                        <div className="ph-state"><span>{t('preset.pkg.noRulesYet')}</span></div>
                    ) : entries.length === 0 ? (
                        <div className="ph-state"><span>{t('auto.noHistoryLogs')}</span></div>
                    ) : (
                        <>
                            <div className="ph-note">
                                {t('preset.historyPerRule', { limit: PER_RULE_LIMIT })}
                                {entries.length >= MAX_ROWS && ` · ${t('preset.historyCapped', { max: MAX_ROWS })}`}
                            </div>
                            <div className="ph-scroll">
                                {days.map(group => (
                                    <div className="ph-day" key={group.day}>
                                        <div className="ph-day-head">{group.day}</div>
                                        <div className="ph-timeline">
                                            {group.items.map(({ log, ruleName }) => {
                                                const ms = timeOf(log);
                                                const timeStr = ms
                                                    ? new Date(ms).toLocaleTimeString(i18n.language)
                                                    : '—';
                                                const status = String(log.status || '').toLowerCase();
                                                const writes = writesOf(log, deviceLabels);
                                                const snapshot = Object.entries(log.trigger_snapshot || {});

                                                let SourceIcon = Zap;
                                                if (log.trigger_source === 'schedule') SourceIcon = Clock;
                                                else if (log.trigger_source === 'manual') SourceIcon = User;

                                                return (
                                                    <div className={`ph-item ${status}`} key={log.id}>
                                                        <div className="ph-dot"><SourceIcon size={11} /></div>
                                                        <div className="ph-card">
                                                            <div className="ph-card-head">
                                                                <span className="ph-time">{timeStr}</span>
                                                                <span className="ph-source">{log.trigger_source || 'sensor'}</span>
                                                                {showRuleTag && (
                                                                    <span className="ph-rule" title={t('preset.historyRuleTip')}>{ruleName}</span>
                                                                )}
                                                                <span className={`ph-status ${status}`}>
                                                                    {(log.status || '').toUpperCase()}
                                                                </span>
                                                            </div>

                                                            {snapshot.length > 0 && (
                                                                <div className="ph-snapshot">
                                                                    <span className="ph-snapshot-title">{t('auto.snapshotTitle')}</span>
                                                                    <div className="ph-chips">
                                                                        {snapshot.map(([k, v]) => (
                                                                            <span className="ph-chip" key={k}>
                                                                                <span className="k">{k}</span>
                                                                                <span className="v">{String(v)}</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {log.error_message && (
                                                                <div className="ph-error">{log.error_message}</div>
                                                            )}

                                                            {writes.length > 0 && (
                                                                <div className="ph-writes">
                                                                    <span className="ph-writes-title">{t('auto.actuatorActions')}</span>
                                                                    <ul>
                                                                        {writes.map(w => (
                                                                            <li key={w.key}>
                                                                                <span className="ph-write-target">
                                                                                    <Cpu size={12} />
                                                                                    <strong>{w.label}</strong>
                                                                                    <span className="ph-eq">=</span>
                                                                                    <code>{w.value}</code>
                                                                                </span>
                                                                                <span
                                                                                    className={`ph-write-status ${w.status.toLowerCase()}`}
                                                                                    title={w.error || undefined}
                                                                                >
                                                                                    {w.status}
                                                                                </span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
