import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    SlidersHorizontal, RefreshCw, Loader2, AlertTriangle, Search,
    Cpu, ChevronRight, Check, CheckCheck, X, Clock, ScrollText, ExternalLink, WifiOff,
} from 'lucide-react';
import { zonesApi, devicesApi, registersApi, controlApi, healthApi } from '../../../api/services';
import { Zone, Device, Register, ActuatorCommandHistoryItem } from '../../../types';
import { localizedName } from '../../../utils/displayNames';
import './ControlPanel.css';

interface ControlPanelProps {
    farmId: string;
}

// What the confirm modal is about to send.
interface PendingWrite {
    reg: Register;
    value: number;
}

// FarmLink publishes edge health every 300s (mqtt_health_interval_seconds), and the
// snapshot's `status` is just the tag of the last point — it never flips to offline
// by itself. So "no point within two publish cycles" IS the offline signal, hence
// this lookback window rather than the default 24h.
const EDGE_HEALTH_WINDOW = '15m';

type EdgeState = 'checking' | 'online' | 'offline';

// How a writable register is rendered, derived from its metadata:
// value_map → named actions; BOOL → ON/OFF; otherwise a bounded number input.
type WidgetKind = 'enum' | 'toggle' | 'number';

const widgetKind = (reg: Register): WidgetKind => {
    if (reg.value_map && Object.keys(reg.value_map).length > 0) return 'enum';
    if (reg.data_type === 'BOOL') return 'toggle';
    return 'number';
};

// Numeric display without float noise (24.500000000001 → "24.5").
const fmtNum = (v: number): string => {
    const rounded = Math.round(v * 1000) / 1000;
    return String(rounded);
};

export default function ControlPanel({ farmId }: ControlPanelProps) {
    const { t, i18n } = useTranslation();
    const nameOf = (rec: Zone | Device | Register) => localizedName(rec, i18n.language);

    const [zones, setZones] = useState<Zone[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Edge connectivity gate: writes only make sense while the farm's FarmLink is
    // alive. The whole console blurs when offline.
    const [edge, setEdge] = useState<EdgeState>('checking');

    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    // Register configs per device, fetched lazily on first selection.
    const [registersByDevice, setRegistersByDevice] = useState<Record<string, Register[]>>({});
    const [loadingRegisters, setLoadingRegisters] = useState(false);

    // Input drafts (string so the user can type freely), keyed by register id.
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const [pending, setPending] = useState<PendingWrite | null>(null);
    const [writing, setWriting] = useState(false);
    const [writeError, setWriteError] = useState<string | null>(null);

    // Write history modal — the server-side audit trail of plain writes
    // (GET .../actuator-commands?source=api), fetched fresh on every open.
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState<ActuatorCommandHistoryItem[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    useEffect(() => {
        if (!farmId) return;
        loadStructure();
        checkEdge();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [farmId]);

    const loadStructure = async () => {
        setLoading(true);
        setError(null);
        try {
            const [zs, devs] = await Promise.all([
                zonesApi.getByFarm(farmId),
                devicesApi.getByFarm(farmId),
            ]);
            zs.sort((a, b) => a.display_order - b.display_order);
            setZones(zs);
            setDevices(devs);
            if (devs.length > 0) selectDevice(devs[0].id);
        } catch (err: any) {
            setError(err?.message || 'Failed to load farm structure');
        } finally {
            setLoading(false);
        }
    };

    const checkEdge = async () => {
        setEdge('checking');
        try {
            const fleet = await healthApi.getFleetEdgeHealth(EDGE_HEALTH_WINDOW);
            const mine = fleet.farms.find(f => f.farm_id === farmId);
            setEdge(mine && mine.status === 'online' ? 'online' : 'offline');
        } catch (err) {
            // Can't determine (e.g. probe failed) — fail open and let the backend be
            // the real gate: a write against a dead farm still errors server-side.
            console.warn('Edge-health probe failed; allowing control UI', err);
            setEdge('online');
        }
    };

    const selectDevice = async (deviceId: string) => {
        setSelectedDeviceId(deviceId);
        setDrafts({});

        if (!registersByDevice[deviceId]) {
            setLoadingRegisters(true);
            try {
                const regs = await registersApi.getByDevice(deviceId);
                setRegistersByDevice(prev => ({ ...prev, [deviceId]: regs }));
            } catch (err) {
                console.error('Failed to load registers', err);
            } finally {
                setLoadingRegisters(false);
            }
        }
    };

    // ── Derived structure for the tree ────────────────────────────────────
    // Same scoping as the Config tab: modbus zones only, plus an "unassigned"
    // group when devices exist without a zone.
    const modbusZones = zones.filter(z => z.default_unit_id != null);
    const filterText = filter.trim().toLowerCase();
    const matchesFilter = (d: Device) =>
        !filterText
        || nameOf(d).toLowerCase().includes(filterText)
        || (d.code || '').toLowerCase().includes(filterText);

    const tree = useMemo(() => {
        const groups: Array<{ key: string; label: string; devices: Device[] }> = [];
        modbusZones.forEach(z => {
            const devs = devices
                .filter(d => d.zone_id === z.id && matchesFilter(d))
                .sort((a, b) => a.display_order - b.display_order);
            if (devs.length) groups.push({ key: z.id, label: nameOf(z), devices: devs });
        });
        const unassigned = devices.filter(d => !d.zone_id && matchesFilter(d));
        if (unassigned.length) groups.push({ key: 'unassigned', label: t('detail.unassigned'), devices: unassigned });
        return groups;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zones, devices, filter, i18n.language]);

    const selectedDevice = devices.find(d => d.id === selectedDeviceId) || null;
    const deviceRegisters = (selectedDeviceId && registersByDevice[selectedDeviceId]) || [];
    const writableRegs = deviceRegisters.filter(r => r.is_active && r.writable);

    // ── Value helpers ──────────────────────────────────────────────────────
    // Decoded display: enum label when a value_map names the value, number+unit otherwise.
    const displayValue = (reg: Register, v: number): string => {
        const mapped = reg.value_map?.[String(v)];
        if (mapped) return `${mapped} (${fmtNum(v)})`;
        return reg.unit ? `${fmtNum(v)} ${reg.unit}` : fmtNum(v);
    };

    const setDraft = (regId: string, value: string) =>
        setDrafts(prev => ({ ...prev, [regId]: value }));

    // Pre-validation mirroring the backend's plain-write rules (data_type shape +
    // min/max) so the Write button disables early; the backend stays the final gate.
    const numberDraftInvalid = (reg: Register): string | null => {
        const raw = (drafts[reg.id] ?? '').trim();
        if (raw === '') return t('control.valueRequired');
        const v = Number(raw);
        if (!Number.isFinite(v)) return t('control.valueRequired');
        const integerKinds = ['INT', 'UNSIGNED_INT', 'BOOL'];
        if (integerKinds.includes(reg.data_type) && !Number.isInteger(v)) {
            return t('control.integerRequired');
        }
        if (reg.data_type === 'UNSIGNED_INT' && v < 0) {
            return t('control.unsignedRequired');
        }
        if (Number.isFinite(reg.min_value) && Number.isFinite(reg.max_value) && (v < reg.min_value || v > reg.max_value)) {
            return t('control.outOfRange', { min: fmtNum(reg.min_value), max: fmtNum(reg.max_value) });
        }
        return null;
    };

    // ── Write flow ─────────────────────────────────────────────────────────
    const requestWrite = (reg: Register, value: number) => {
        setWriteError(null);
        setPending({ reg, value });
    };

    const executeWrite = async () => {
        if (!pending) return;
        const { reg, value } = pending;
        setWriting(true);
        setWriteError(null);
        try {
            const resp = await controlApi.plainWrite(farmId, reg.id, value);
            if (resp.success) {
                setPending(null);
                setDrafts(prev => { const next = { ...prev }; delete next[reg.id]; return next; });
            } else {
                // 200 + success:false — the audit row exists but MQTT publish failed.
                setWriteError(resp.message || 'Failed to publish MQTT write command');
            }
        } catch (err: any) {
            setWriteError(err?.message || 'unknown error');
        } finally {
            setWriting(false);
        }
    };

    // ── Write history ──────────────────────────────────────────────────────
    const HISTORY_PAGE = 50;

    const loadHistory = async (offset: number) => {
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const page = await controlApi.getWriteHistory(farmId, HISTORY_PAGE, offset);
            setHistoryItems(prev => offset === 0 ? page.items : [...prev, ...page.items]);
            setHistoryTotal(page.total);
        } catch (err: any) {
            setHistoryError(err?.message || 'unknown error');
        } finally {
            setHistoryLoading(false);
        }
    };

    const openHistory = () => {
        setHistoryOpen(true);
        setHistoryItems([]);
        setHistoryTotal(0);
        loadHistory(0);
    };

    // Enrich a history row with the register metadata already cached from the tree
    // (for value_map decoding); rows for devices never visited fall back to raw.
    const historyValueLabel = (item: ActuatorCommandHistoryItem): string => {
        const reg = Object.values(registersByDevice).flat().find(r => r.id === item.register_id);
        const mapped = reg?.value_map?.[String(item.value)];
        if (mapped) return `${mapped} (${fmtNum(item.value)})`;
        return reg?.unit ? `${fmtNum(item.value)} ${reg.unit}` : fmtNum(item.value);
    };

    // Command lifecycle: pending (row created, not yet published) → sent (on the
    // MQTT broker, FarmLink not heard from yet) → acked (FarmLink executed the
    // modbus write and replied success) | failed (publish or execution failed).
    const statusMeta = (status: string) => {
        if (status === 'acked') return { icon: <CheckCheck size={12} />, cls: 'acked', label: t('control.statusAcked') };
        if (status === 'sent') return { icon: <Check size={12} />, cls: 'sent', label: t('control.statusSent') };
        if (status === 'failed') return { icon: <X size={12} />, cls: 'failed', label: t('control.statusFailed') };
        return { icon: <Clock size={12} />, cls: 'pending', label: t('control.statusPending') };
    };

    // ── Render ─────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="control-tab">
                <div className="control-panel loading-state">
                    <Loader2 size={28} className="spinner" />
                    <p>{t('control.loading')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="control-tab">
                <div className="control-panel error-state">
                    <AlertTriangle size={28} />
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const offline = edge === 'offline';

    return (
        <div className="control-tab">
            <div className="control-header">
                <div>
                    <h3><SlidersHorizontal size={16} className="control-title-icon" /> {t('control.title')}</h3>
                    <p>{t('control.desc')}</p>
                </div>
                <button className="control-log-toggle" onClick={openHistory}>
                    <ScrollText size={14} /> {t('control.writeHistory')}
                </button>
            </div>

            {/* Offline / connectivity banner sits above the (blurred) console */}
            {edge === 'checking' && (
                <div className="control-edge-checking">
                    <Loader2 size={13} className="spinner" /> {t('control.checkingEdge')}
                </div>
            )}
            {offline && (
                <div className="control-edge-banner">
                    <WifiOff size={16} />
                    <div className="edge-banner-text">
                        <strong>{t('control.offlineTitle')}</strong>
                        <span>{t('control.offlineDesc')}</span>
                    </div>
                    <button className="edge-recheck-btn" onClick={checkEdge}>
                        <RefreshCw size={13} /> {t('control.recheck')}
                    </button>
                </div>
            )}

            <div className="control-notice">
                <AlertTriangle size={14} />
                <span>
                    {t('control.notice')}
                    {import.meta.env.VITE_DASHBOARD_URL && (
                        <>
                            {' '}
                            <a href={import.meta.env.VITE_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                                {t('control.noticeDashboardLink')} <ExternalLink size={11} />
                            </a>
                        </>
                    )}
                </span>
            </div>

            {/* The console body: blurred + inert while the farm is offline */}
            <div className={`control-body ${offline ? 'edge-offline' : ''}`} aria-disabled={offline}>
                {/* Left: zone → device tree */}
                <div className="control-tree">
                    <div className="control-filter">
                        <Search size={13} />
                        <input
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder={t('control.filterPlaceholder')}
                        />
                    </div>
                    <div className="control-tree-scroll">
                        {tree.length === 0 && <div className="control-tree-empty">{t('control.noDevices')}</div>}
                        {tree.map(group => (
                            <div key={group.key} className="control-tree-group">
                                <div className="control-tree-zone">{group.label}</div>
                                {group.devices.map(dev => (
                                    <button
                                        key={dev.id}
                                        className={`control-tree-device ${selectedDeviceId === dev.id ? 'selected' : ''}`}
                                        onClick={() => selectDevice(dev.id)}
                                    >
                                        <Cpu size={13} />
                                        <span className="dev-name">{nameOf(dev)}</span>
                                        <ChevronRight size={13} className="chev" />
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: write console for the selected device */}
                <div className="control-surface">
                    {!selectedDevice ? (
                        <div className="control-placeholder">{t('control.selectDevice')}</div>
                    ) : (
                        <>
                            <div className="control-surface-head">
                                <div className="surface-title">
                                    <h4>{nameOf(selectedDevice)}</h4>
                                    <span className="surface-meta">
                                        {t('detail.unitId')}: {selectedDevice.unit_id} · {selectedDevice.device_kind}
                                    </span>
                                </div>
                            </div>

                            {loadingRegisters ? (
                                <div className="control-placeholder"><Loader2 size={20} className="spinner" /></div>
                            ) : (
                                <div className="control-surface-scroll">
                                    <h5 className="surface-section">{t('control.writable')}</h5>
                                    {writableRegs.length === 0 ? (
                                        <div className="control-placeholder small">{t('control.noWritable')}</div>
                                    ) : (
                                        <div className="control-cards">
                                            {writableRegs.map(reg => {
                                                const kind = widgetKind(reg);
                                                return (
                                                    <div key={reg.id} className="control-card">
                                                        <div className="card-head">
                                                            <span className="card-name">{nameOf(reg)}</span>
                                                            <span className={`role-chip role-${reg.role}`}>{reg.role}</span>
                                                        </div>
                                                        <div className="card-addr">
                                                            {reg.code} · @{reg.address} (0x{reg.address.toString(16).toUpperCase()}) · {reg.data_type}
                                                        </div>

                                                        {kind === 'enum' && (
                                                            <div className="card-control">
                                                                <select
                                                                    value={drafts[reg.id] ?? ''}
                                                                    onChange={e => setDraft(reg.id, e.target.value)}
                                                                >
                                                                    <option value="" disabled>{t('control.pickAction')}</option>
                                                                    {Object.entries(reg.value_map || {})
                                                                        .sort(([a], [b]) => Number(a) - Number(b))
                                                                        .map(([k, label]) => (
                                                                            <option key={k} value={k}>{label} ({k})</option>
                                                                        ))}
                                                                </select>
                                                                <button
                                                                    className="write-btn"
                                                                    disabled={offline || !drafts[reg.id]}
                                                                    onClick={() => requestWrite(reg, Number(drafts[reg.id]))}
                                                                >
                                                                    {t('control.write')}
                                                                </button>
                                                            </div>
                                                        )}

                                                        {kind === 'toggle' && (
                                                            <div className="card-control">
                                                                <div className="toggle-group">
                                                                    <button
                                                                        className="toggle-opt"
                                                                        disabled={offline}
                                                                        onClick={() => requestWrite(reg, 0)}
                                                                    >
                                                                        {t('control.off')}
                                                                    </button>
                                                                    <button
                                                                        className="toggle-opt"
                                                                        disabled={offline}
                                                                        onClick={() => requestWrite(reg, 1)}
                                                                    >
                                                                        {t('control.on')}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {kind === 'number' && (
                                                            <div className="card-control number">
                                                                {Number.isFinite(reg.min_value) && Number.isFinite(reg.max_value) && reg.max_value > reg.min_value && (
                                                                    <input
                                                                        type="range"
                                                                        min={reg.min_value}
                                                                        max={reg.max_value}
                                                                        step={reg.data_type === 'FLOAT' ? 0.1 : 1}
                                                                        value={(drafts[reg.id] ?? '').trim() !== '' && Number.isFinite(Number(drafts[reg.id])) ? Number(drafts[reg.id]) : reg.min_value}
                                                                        onChange={e => setDraft(reg.id, e.target.value)}
                                                                    />
                                                                )}
                                                                <div className="number-row">
                                                                    <input
                                                                        type="number"
                                                                        step={['INT', 'UNSIGNED_INT', 'BOOL'].includes(reg.data_type) ? 1 : 'any'}
                                                                        value={drafts[reg.id] ?? ''}
                                                                        placeholder={t('control.valuePlaceholder')}
                                                                        onChange={e => setDraft(reg.id, e.target.value)}
                                                                    />
                                                                    {reg.unit && <span className="unit">{reg.unit}</span>}
                                                                    <button
                                                                        className="write-btn"
                                                                        disabled={offline || !!numberDraftInvalid(reg)}
                                                                        onClick={() => requestWrite(reg, Number(drafts[reg.id]))}
                                                                    >
                                                                        {t('control.write')}
                                                                    </button>
                                                                </div>
                                                                <span className={`range-hint ${(drafts[reg.id] ?? '') !== '' && numberDraftInvalid(reg) ? 'invalid' : ''}`}>
                                                                    {((drafts[reg.id] ?? '') !== '' && numberDraftInvalid(reg))
                                                                        || t('control.range', { min: fmtNum(reg.min_value), max: fmtNum(reg.max_value) })}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Write-history modal (server-side audit of plain writes) */}
            {historyOpen && (
                <div className="ctrl-modal-overlay" onClick={() => setHistoryOpen(false)}>
                    <div className="ctrl-modal history-modal" onClick={e => e.stopPropagation()}>
                        <div className="history-head">
                            <h3><ScrollText size={16} /> {t('control.writeHistory')}</h3>
                            <div className="history-head-actions">
                                <button className="history-icon-btn" title={t('control.historyRefresh')} disabled={historyLoading} onClick={() => loadHistory(0)}>
                                    <RefreshCw size={14} className={historyLoading ? 'spinner' : ''} />
                                </button>
                                <button className="history-icon-btn" onClick={() => setHistoryOpen(false)}>
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        {historyError && (
                            <div className="ctrl-modal-error">{t('control.historyFailed', { error: historyError })}</div>
                        )}

                        <div className="history-list">
                            {historyLoading && historyItems.length === 0 ? (
                                <div className="history-empty"><Loader2 size={18} className="spinner" /></div>
                            ) : historyItems.length === 0 && !historyError ? (
                                <div className="history-empty">{t('control.historyEmpty')}</div>
                            ) : (
                                historyItems.map(item => {
                                    const s = statusMeta(item.status);
                                    return (
                                        <div key={item.id} className="history-row" title={`command_id: ${item.id}`}>
                                            <span className={`history-status ${s.cls}`}>{s.icon} {s.label}</span>
                                            <div className="history-main">
                                                <span className="history-target">
                                                    {item.device_name || item.device_id}
                                                    <span className="history-reg"> · {item.register_code || item.register_id}</span>
                                                    {item.slave_id != null && <span className="history-reg"> · unit {item.slave_id}</span>}
                                                </span>
                                                <span className="history-value">→ {historyValueLabel(item)}</span>
                                                {item.status === 'failed' && item.error_message && (
                                                    <span className="history-error">{item.error_message}</span>
                                                )}
                                            </div>
                                            <div className="history-side">
                                                <span className="history-time">{item.requested_at ? new Date(item.requested_at).toLocaleString() : '—'}</span>
                                                {item.user_name && <span className="history-user">{item.user_name}</span>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {historyItems.length > 0 && historyItems.length < historyTotal && (
                            <button className="history-more" disabled={historyLoading} onClick={() => loadHistory(historyItems.length)}>
                                {historyLoading
                                    ? <Loader2 size={13} className="spinner" />
                                    : t('control.historyLoadMore', { shown: historyItems.length, total: historyTotal })}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Confirm-write modal */}
            {pending && (
                <div className="ctrl-modal-overlay">
                    <div className="ctrl-modal">
                        <h3><AlertTriangle size={16} /> {t('control.confirmTitle')}</h3>
                        <p className="ctrl-modal-warn">{t('control.confirmDesc')}</p>
                        <div className="ctrl-modal-facts">
                            <div className="fact">
                                <span className="fact-label">{t('control.confirmDevice')}</span>
                                <span>{selectedDevice ? nameOf(selectedDevice) : ''}</span>
                            </div>
                            <div className="fact">
                                <span className="fact-label">{t('control.confirmRegister')}</span>
                                <span>{nameOf(pending.reg)} ({pending.reg.code} @{pending.reg.address})</span>
                            </div>
                            <div className="fact">
                                <span className="fact-label">{t('control.confirmValue')}</span>
                                <span className="fact-change">
                                    <strong>{displayValue(pending.reg, pending.value)}</strong>
                                </span>
                            </div>
                            {pending.reg.scale_factor !== 1 && pending.reg.scale_factor !== 0 && (
                                <div className="fact raw-note">
                                    {t('control.rawNote', {
                                        raw: fmtNum(pending.value / pending.reg.scale_factor),
                                        scale: pending.reg.scale_factor,
                                    })}
                                </div>
                            )}
                        </div>
                        {writeError && (
                            <div className="ctrl-modal-error">{t('control.writeFailed', { error: writeError })}</div>
                        )}
                        <div className="ctrl-modal-actions">
                            <button disabled={writing} onClick={() => { setPending(null); setWriteError(null); }}>
                                {t('btn.cancel')}
                            </button>
                            <button className="danger" disabled={writing} onClick={executeWrite}>
                                {writing ? <Loader2 size={13} className="spinner" /> : null}
                                {t('control.confirmWrite')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
