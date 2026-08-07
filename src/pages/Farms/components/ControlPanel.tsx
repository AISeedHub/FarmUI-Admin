import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    SlidersHorizontal, RefreshCw, Loader2, AlertTriangle, Search,
    Cpu, ChevronRight, Check, X, ScrollText, ExternalLink,
} from 'lucide-react';
import { zonesApi, devicesApi, registersApi, controlApi } from '../../../api/services';
import { Zone, Device, Register, RegisterValueReading } from '../../../types';
import { localizedName } from '../../../utils/displayNames';
import './ControlPanel.css';

interface ControlPanelProps {
    farmId: string;
}

// One entry in the session-local write log (server-side auditing is the backend's
// job — this list only shows what happened in this browser tab).
interface WriteLogEntry {
    time: string;
    regCode: string;
    value: number;
    label?: string;
    ok: boolean;
    message?: string;
}

// What the confirm modal is about to send.
interface PendingWrite {
    reg: Register;
    value: number;
}

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

// Member-facing Dashboard deployment — day-to-day control belongs there, and the
// expert notice links to it when configured.
const DASHBOARD_URL: string = import.meta.env.VITE_DASHBOARD_URL || '';

export default function ControlPanel({ farmId }: ControlPanelProps) {
    const { t, i18n } = useTranslation();
    const nameOf = (rec: Zone | Device | Register) => localizedName(rec, i18n.language);

    const [zones, setZones] = useState<Zone[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    // Register configs per device, fetched lazily on first selection.
    const [registersByDevice, setRegistersByDevice] = useState<Record<string, Register[]>>({});
    const [loadingRegisters, setLoadingRegisters] = useState(false);

    // Live values for the selected device, keyed by register id.
    const [values, setValues] = useState<Record<string, RegisterValueReading>>({});
    const [reading, setReading] = useState(false);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [lastReadAt, setLastReadAt] = useState<Date | null>(null);
    const readInFlight = useRef(false);

    // Input drafts (string so the user can type freely), keyed by register id.
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const [pending, setPending] = useState<PendingWrite | null>(null);
    const [writing, setWriting] = useState(false);
    const [writeError, setWriteError] = useState<string | null>(null);
    const [writeLog, setWriteLog] = useState<WriteLogEntry[]>([]);
    const [logOpen, setLogOpen] = useState(false);

    useEffect(() => {
        if (farmId) loadStructure();
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

    const selectDevice = async (deviceId: string) => {
        setSelectedDeviceId(deviceId);
        setValues({});
        setDrafts({});
        setLiveError(null);
        setLastReadAt(null);

        setLoadingRegisters(true);
        try {
            let regs = registersByDevice[deviceId];
            if (!regs) {
                regs = await registersApi.getByDevice(deviceId);
                setRegistersByDevice(prev => ({ ...prev, [deviceId]: regs! }));
            }
        } catch (err) {
            console.error('Failed to load registers', err);
        } finally {
            setLoadingRegisters(false);
        }
        readValues(deviceId, true);
    };

    // `announce` shows the spinner + surfaces errors; the background poll stays silent
    // so a single flaky read doesn't flash a banner over the panel.
    const readValues = async (deviceId: string, announce: boolean) => {
        if (readInFlight.current) return;
        readInFlight.current = true;
        if (announce) setReading(true);
        try {
            const readings = await controlApi.readDeviceValues(deviceId);
            const map: Record<string, RegisterValueReading> = {};
            readings.forEach(r => { map[r.register_id] = r; });
            setValues(map);
            setLastReadAt(new Date());
            setLiveError(null);
        } catch (err: any) {
            if (announce) setLiveError(err?.message || 'unknown error');
        } finally {
            readInFlight.current = false;
            if (announce) setReading(false);
        }
    };

    // Background refresh while a device is selected. Paused while the confirm modal
    // is open so the values under confirmation don't shift mid-decision.
    useEffect(() => {
        if (!selectedDeviceId || pending) return;
        const timer = setInterval(() => readValues(selectedDeviceId, false), 10000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDeviceId, pending]);

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
    const readOnlyRegs = deviceRegisters.filter(r => r.is_active && !r.writable);

    // ── Value helpers ──────────────────────────────────────────────────────
    const currentOf = (reg: Register): number | null => values[reg.id]?.value ?? null;

    // Decoded display: enum label when a value_map names the value, number+unit otherwise.
    const displayValue = (reg: Register, v: number | null): string => {
        if (v == null) return t('control.unknown');
        const mapped = reg.value_map?.[String(v)];
        if (mapped) return `${mapped} (${fmtNum(v)})`;
        return reg.unit ? `${fmtNum(v)} ${reg.unit}` : fmtNum(v);
    };

    const draftOf = (reg: Register): string => {
        const d = drafts[reg.id];
        if (d !== undefined) return d;
        const cur = currentOf(reg);
        return cur != null ? fmtNum(cur) : '';
    };

    const setDraft = (regId: string, value: string) =>
        setDrafts(prev => ({ ...prev, [regId]: value }));

    const numberDraftInvalid = (reg: Register): string | null => {
        const raw = draftOf(reg);
        if (raw.trim() === '') return t('control.valueRequired');
        const v = Number(raw);
        if (!Number.isFinite(v)) return t('control.valueRequired');
        if (v < reg.min_value || v > reg.max_value) {
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
        if (!pending || !selectedDeviceId) return;
        const { reg, value } = pending;
        setWriting(true);
        setWriteError(null);
        try {
            await controlApi.writeRegister(reg.id, value);
            setWriteLog(prev => [{
                time: new Date().toLocaleTimeString(),
                regCode: reg.code,
                value,
                label: reg.value_map?.[String(value)],
                ok: true,
            }, ...prev].slice(0, 30));
            setPending(null);
            setDrafts(prev => { const next = { ...prev }; delete next[reg.id]; return next; });
            // Read back right away, and once more shortly after for registers whose
            // value transitions server-side (e.g. Reboot → Rebooting → Complete).
            readValues(selectedDeviceId, true);
            setTimeout(() => { if (selectedDeviceId) readValues(selectedDeviceId, false); }, 2500);
        } catch (err: any) {
            setWriteError(err?.message || 'unknown error');
            setWriteLog(prev => [{
                time: new Date().toLocaleTimeString(),
                regCode: reg.code,
                value,
                label: reg.value_map?.[String(value)],
                ok: false,
                message: err?.message,
            }, ...prev].slice(0, 30));
        } finally {
            setWriting(false);
        }
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

    return (
        <div className="control-tab">
            <div className="control-header">
                <div>
                    <h3><SlidersHorizontal size={16} className="control-title-icon" /> {t('control.title')}</h3>
                    <p>{t('control.desc')}</p>
                </div>
                {writeLog.length > 0 && (
                    <button className="control-log-toggle" onClick={() => setLogOpen(o => !o)}>
                        <ScrollText size={14} /> {t('control.sessionLog')} ({writeLog.length})
                    </button>
                )}
            </div>

            <div className="control-notice">
                <AlertTriangle size={14} />
                <span>
                    {t('control.notice')}
                    {DASHBOARD_URL && (
                        <>
                            {' '}
                            <a href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                                {t('control.noticeDashboardLink')} <ExternalLink size={11} />
                            </a>
                        </>
                    )}
                </span>
            </div>

            {logOpen && writeLog.length > 0 && (
                <div className="control-log">
                    {writeLog.map((entry, i) => (
                        <div key={i} className={`control-log-row ${entry.ok ? 'ok' : 'fail'}`}>
                            {entry.ok ? <Check size={12} /> : <X size={12} />}
                            <span className="log-time">{entry.time}</span>
                            <span className="log-reg">{entry.regCode}</span>
                            <span className="log-val">→ {entry.label ? `${entry.label} (${fmtNum(entry.value)})` : fmtNum(entry.value)}</span>
                            {entry.message && <span className="log-msg">{entry.message}</span>}
                        </div>
                    ))}
                </div>
            )}

            <div className="control-body">
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

                {/* Right: control surface for the selected device */}
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
                                <div className="surface-read">
                                    {lastReadAt && !reading && (
                                        <span className="last-read">{t('control.lastRead', { time: lastReadAt.toLocaleTimeString() })}</span>
                                    )}
                                    <button
                                        className="read-btn"
                                        disabled={reading}
                                        onClick={() => readValues(selectedDevice.id, true)}
                                    >
                                        <RefreshCw size={13} className={reading ? 'spinning' : ''} />
                                        {reading ? t('control.reading') : t('control.readNow')}
                                    </button>
                                </div>
                            </div>

                            {liveError && (
                                <div className="control-live-error">
                                    <AlertTriangle size={14} />
                                    {t('control.liveUnavailable', { error: liveError })}
                                </div>
                            )}

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
                                                const cur = currentOf(reg);
                                                return (
                                                    <div key={reg.id} className="control-card">
                                                        <div className="card-head">
                                                            <span className="card-name">{nameOf(reg)}</span>
                                                            <span className={`role-chip role-${reg.role}`}>{reg.role}</span>
                                                        </div>
                                                        <div className="card-addr">
                                                            {reg.code} · @{reg.address} (0x{reg.address.toString(16).toUpperCase()}) · {reg.data_type}
                                                        </div>
                                                        <div className="card-current">
                                                            <span className="cur-label">{t('control.current')}</span>
                                                            <span className={`cur-value ${cur == null ? 'unknown' : ''}`}>
                                                                {displayValue(reg, cur)}
                                                            </span>
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
                                                                    disabled={!drafts[reg.id]}
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
                                                                        className={`toggle-opt ${cur === 0 ? 'active off' : ''}`}
                                                                        onClick={() => cur !== 0 && requestWrite(reg, 0)}
                                                                    >
                                                                        {t('control.off')}
                                                                    </button>
                                                                    <button
                                                                        className={`toggle-opt ${cur === 1 ? 'active on' : ''}`}
                                                                        onClick={() => cur !== 1 && requestWrite(reg, 1)}
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
                                                                        value={draftOf(reg).trim() !== '' && Number.isFinite(Number(draftOf(reg))) ? Number(draftOf(reg)) : reg.min_value}
                                                                        onChange={e => setDraft(reg.id, e.target.value)}
                                                                    />
                                                                )}
                                                                <div className="number-row">
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        value={draftOf(reg)}
                                                                        onChange={e => setDraft(reg.id, e.target.value)}
                                                                    />
                                                                    {reg.unit && <span className="unit">{reg.unit}</span>}
                                                                    <button
                                                                        className="write-btn"
                                                                        disabled={!!numberDraftInvalid(reg)}
                                                                        onClick={() => requestWrite(reg, Number(draftOf(reg)))}
                                                                    >
                                                                        {t('control.write')}
                                                                    </button>
                                                                </div>
                                                                <span className={`range-hint ${numberDraftInvalid(reg) ? 'invalid' : ''}`}>
                                                                    {numberDraftInvalid(reg) || t('control.range', { min: fmtNum(reg.min_value), max: fmtNum(reg.max_value) })}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {readOnlyRegs.length > 0 && (
                                        <>
                                            <h5 className="surface-section">{t('control.readOnly')}</h5>
                                            <div className="ro-chips">
                                                {readOnlyRegs.map(reg => (
                                                    <div key={reg.id} className="ro-chip" title={`${reg.code} @${reg.address}`}>
                                                        <span className="ro-name">{nameOf(reg)}</span>
                                                        <span className="ro-value">{displayValue(reg, currentOf(reg))}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

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
                                <span className="fact-label">{t('control.confirmChange')}</span>
                                <span className="fact-change">
                                    {displayValue(pending.reg, currentOf(pending.reg))}
                                    <ChevronRight size={13} />
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
                                {t('control.write')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
