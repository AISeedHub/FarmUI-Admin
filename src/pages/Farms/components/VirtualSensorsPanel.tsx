import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    Sigma, Plus, Pencil, Trash2, Loader2, AlertTriangle, RefreshCw, X, Save, Lock, Info,
} from 'lucide-react';
import { virtualSensorsApi, devicesApi, registersApi, zonesApi, ApiError } from '../../../api/services';
import {
    VirtualSensor, VirtualSensorAgg, VirtualSensorCreate, VirtualSensorUpdate,
    VirtualSensorInUse, Device, Register, Zone,
} from '../../../types';
import { displayNamesToText, emptyDisplayNamesText, parseDisplayNamesText, localizedName } from '../../../utils/displayNames';
import { buildDeviceLabels } from '../../../utils/deviceLabel';
import { VIRTUAL_SENSOR_CODE_MAX_LENGTH } from '../../../utils/code';
// The editor modal reuses the .ae-* shell, so pull that stylesheet in explicitly
// rather than relying on another component having been imported first.
import './AutomationEditorModal.css';
import './VirtualSensorsPanel.css';

interface VirtualSensorsPanelProps {
    farmId: string;
}

const AGGS: VirtualSensorAgg[] = ['min', 'avg', 'max'];

// Editing form state. `code` is only writable while creating — it is the identifier
// the rules bundle carries, so the backend rejects changes to it.
interface VsForm {
    code: string;
    name: string;
    displayNamesStr: string;
    agg: VirtualSensorAgg;
    unit: string;
    isActive: boolean;
    sourceIds: string[];
}

const emptyForm = (): VsForm => ({
    code: '', name: '', displayNamesStr: emptyDisplayNamesText(), agg: 'min', unit: '', isActive: true, sourceIds: [],
});

const CODE_RE = /^[a-z][a-z0-9_]*$/;

// A 409 from deactivate/delete carries the automations still referencing the sensor.
const inUseAutomations = (err: unknown): Array<{ id: string; name: string }> | null => {
    if (!(err instanceof ApiError) || err.status !== 409) return null;
    const detail = err.detail as VirtualSensorInUse | undefined;
    return Array.isArray(detail?.automations) ? detail!.automations : [];
};

export default function VirtualSensorsPanel({ farmId }: VirtualSensorsPanelProps) {
    const { t, i18n } = useTranslation();

    const [sensors, setSensors] = useState<VirtualSensor[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    // Zones only qualify the device names ("Temperature Sensor" repeats per zone).
    const [zones, setZones] = useState<Zone[]>([]);
    const [registersByDevice, setRegistersByDevice] = useState<Record<string, Register[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Editor modal: null = closed, { vs: null } = create.
    const [editor, setEditor] = useState<{ vs: VirtualSensor | null } | null>(null);
    const [form, setForm] = useState<VsForm>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    // Rows blocked by a 409, with the automations that hold them.
    const [blocked, setBlocked] = useState<Record<string, Array<{ id: string; name: string }>>>({});

    useEffect(() => {
        if (farmId) loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [farmId]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [vsList, devs, zoneList] = await Promise.all([
                virtualSensorsApi.getByFarm(farmId),
                devicesApi.getByFarm(farmId),
                zonesApi.getByFarm(farmId).catch(err => {
                    console.warn('Failed to load zones:', err);
                    return [] as Zone[];
                }),
            ]);
            const entries = await Promise.all(
                devs.map(async d => {
                    try { return [d.id, await registersApi.getByDevice(d.id)] as const; }
                    catch { return [d.id, [] as Register[]] as const; }
                })
            );
            setSensors(vsList);
            setDevices(devs);
            setZones(zoneList);
            setRegistersByDevice(Object.fromEntries(entries) as Record<string, Register[]>);
        } catch (err: any) {
            console.error('Failed to load virtual sensors:', err);
            setError(err?.message || 'Failed to load virtual sensors');
        } finally {
            setLoading(false);
        }
    };

    const deviceById = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])) as Record<string, Device>, [devices]);
    // deviceId → "<zone> · <device>", with the device code appended if that still collides.
    const deviceLabels = useMemo(
        () => buildDeviceLabels(devices, zones, i18n.language, t('detail.unassigned')),
        [devices, zones, i18n.language, t],
    );
    const registerToDevice = useMemo(() => {
        const m: Record<string, string> = {};
        Object.entries(registersByDevice).forEach(([devId, regs]) => regs.forEach(r => { m[r.id] = devId; }));
        return m;
    }, [registersByDevice]);
    const registerById = useMemo(() => {
        const m: Record<string, Register> = {};
        Object.values(registersByDevice).flat().forEach(r => { m[r.id] = r; });
        return m;
    }, [registersByDevice]);

    // Selectable sources: the `value` register of every active sensor device in the farm.
    const candidates = useMemo(() => {
        const out: Array<{ register: Register; device: Device }> = [];
        devices
            .filter(d => d.device_kind === 'sensor' && d.is_active)
            .forEach(d => (registersByDevice[d.id] || [])
                .filter(r => r.role === 'value' && r.is_active)
                .forEach(r => out.push({ register: r, device: d })));
        // Sort by the zone-qualified label so the picker groups sensors by zone.
        return out.sort((a, b) => (deviceLabels[a.device.id] || '').localeCompare(deviceLabels[b.device.id] || ''));
    }, [devices, registersByDevice, deviceLabels]);

    const sourceLabel = (rid: string): string => {
        const devId = registerToDevice[rid] || '';
        return deviceLabels[devId] || deviceById[devId]?.name || registerById[rid]?.code || rid.slice(0, 8);
    };

    const openCreate = () => {
        setForm(emptyForm());
        setEditor({ vs: null });
    };

    const openEdit = (vs: VirtualSensor) => {
        setForm({
            code: vs.code,
            name: vs.name,
            displayNamesStr: displayNamesToText(vs.display_names),
            agg: vs.agg,
            unit: vs.unit || '',
            isActive: vs.is_active,
            sourceIds: [...(vs.source_register_ids || [])],
        });
        setEditor({ vs });
    };

    const addSource = (rid: string) => {
        if (!rid || form.sourceIds.includes(rid)) return;
        setForm(f => ({ ...f, sourceIds: [...f.sourceIds, rid], unit: f.unit || (registerById[rid]?.unit || '') }));
    };
    const removeSource = (rid: string) => setForm(f => ({ ...f, sourceIds: f.sourceIds.filter(x => x !== rid) }));

    const handleSave = async () => {
        const isCreate = !editor?.vs;
        if (!form.name.trim()) { alert(t('vs.vName')); return; }
        if (isCreate && !CODE_RE.test(form.code.trim())) { alert(t('vs.vCode')); return; }
        if (form.sourceIds.length === 0) { alert(t('vs.vSources')); return; }
        // Mixing units would make the aggregate meaningless — the backend rejects it too.
        const units = new Set(form.sourceIds.map(id => (registerById[id]?.unit || '').trim().toLowerCase()));
        if (units.size > 1) { alert(t('vs.vUnitMix')); return; }

        // Blank entries of the pre-filled scaffold are dropped before sending.
        const dn = parseDisplayNamesText(form.displayNamesStr);
        if (!dn.ok) {
            alert(t('detail.invalidJson'));
            return;
        }
        const display_names = dn.value ?? undefined;

        setSaving(true);
        try {
            if (isCreate) {
                const payload: VirtualSensorCreate = {
                    code: form.code.trim(),
                    name: form.name.trim(),
                    display_names,
                    agg: form.agg,
                    unit: form.unit.trim() || null,
                    source_register_ids: form.sourceIds,
                };
                await virtualSensorsApi.create(farmId, payload);
            } else {
                const payload: VirtualSensorUpdate = {
                    name: form.name.trim(),
                    display_names,
                    agg: form.agg,
                    unit: form.unit.trim() || null,
                    is_active: form.isActive,
                    source_register_ids: form.sourceIds,
                };
                await virtualSensorsApi.update(editor!.vs!.id, payload);
            }
            setEditor(null);
            await loadData();
        } catch (err: any) {
            // Only an update can 409 (deactivating one that conditions still use).
            const users = editor?.vs ? inUseAutomations(err) : null;
            if (users) {
                setBlocked(prev => ({ ...prev, [editor!.vs!.id]: users }));
                alert(t('vs.inUseAlert', { count: users.length }));
            } else {
                alert(t('vs.actionFailed', { error: err?.message || 'Unknown error' }));
            }
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (vs: VirtualSensor) => {
        setBusyId(vs.id);
        try {
            await virtualSensorsApi.update(vs.id, { is_active: !vs.is_active });
            setBlocked(prev => { const next = { ...prev }; delete next[vs.id]; return next; });
            await loadData();
        } catch (err: any) {
            const users = inUseAutomations(err);
            if (users) {
                setBlocked(prev => ({ ...prev, [vs.id]: users }));
            } else {
                alert(t('vs.actionFailed', { error: err?.message || 'Unknown error' }));
            }
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (vs: VirtualSensor) => {
        if (!window.confirm(t('vs.deleteConfirm', { name: localizedName(vs, i18n.language) }))) return;
        setBusyId(vs.id);
        try {
            await virtualSensorsApi.delete(vs.id);
            await loadData();
        } catch (err: any) {
            const users = inUseAutomations(err);
            if (users) {
                setBlocked(prev => ({ ...prev, [vs.id]: users }));
            } else {
                alert(t('vs.actionFailed', { error: err?.message || 'Unknown error' }));
            }
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return (
            <div className="vs-tab">
                <div className="vs-panel panel loading-state">
                    <Loader2 className="spinner" size={22} />
                    <span>{t('common.loading')}</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="vs-tab">
                <div className="vs-panel panel error-state">
                    <AlertTriangle size={22} />
                    <span>{error}</span>
                    <button className="secondary-btn" onClick={loadData}>
                        <RefreshCw size={14} /> {t('preset.retry')}
                    </button>
                </div>
            </div>
        );
    }

    const addable = candidates.filter(x => !form.sourceIds.includes(x.register.id));

    return (
        <div className="vs-tab">
            <div className="vs-panel panel">
                <div className="section-header">
                    <div>
                        <h3><Sigma size={16} className="vs-title-icon" /> {t('vs.title')}</h3>
                        <p>{t('vs.desc')}</p>
                    </div>
                    <div className="actions">
                        <button className="secondary-btn flex-center" onClick={loadData}>
                            <RefreshCw size={14} /> {t('vs.refresh')}
                        </button>
                        <button className="primary-btn flex-center" onClick={openCreate}>
                            <Plus size={14} /> {t('vs.newSensor')}
                        </button>
                    </div>
                </div>

                {sensors.length === 0 ? (
                    <div className="vs-empty">
                        <Sigma size={26} />
                        <p>{t('vs.empty')}</p>
                        <span className="vs-empty-hint">{t('vs.emptyHint')}</span>
                    </div>
                ) : (
                    <div className="vs-list">
                        {sensors.map(vs => {
                            const users = blocked[vs.id];
                            return (
                                <div className="vs-card" key={vs.id}>
                                    <div className="vs-main">
                                        <div className="vs-info">
                                            <div className="vs-name-row">
                                                <span className={`dot ${vs.is_active ? 'active' : 'inactive'}`}></span>
                                                <span className="vs-name" title={vs.name}>{localizedName(vs, i18n.language)}</span>
                                                <span className={`vs-agg ${vs.agg}`}>{t(`auto.agg.${vs.agg}`)}</span>
                                                <code className="vs-code">{vs.code}</code>
                                                {vs.unit && <span className="vs-unit">{vs.unit}</span>}
                                            </div>
                                            <div className="vs-sources">
                                                {(vs.source_register_ids || []).map(rid => (
                                                    <span className="vs-source" key={rid} title={registerById[rid]?.code || rid}>
                                                        {sourceLabel(rid)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="vs-controls">
                                            <span className={`status-badge ${vs.is_active ? 'enabled' : 'disabled'}`}>
                                                {vs.is_active ? t('vs.active') : t('vs.inactive')}
                                            </span>
                                            <div
                                                className={`toggle ${vs.is_active ? 'on' : 'off'} ${busyId === vs.id ? 'busy' : ''}`}
                                                onClick={() => busyId === vs.id ? undefined : handleToggleActive(vs)}
                                                title={t('vs.toggleTip')}
                                            >
                                                <div className="knob"></div>
                                            </div>
                                            <button className="history-btn icon-only" title={t('vs.editTip')} onClick={() => openEdit(vs)}>
                                                <Pencil size={12} />
                                            </button>
                                            <button className="history-btn icon-only danger" title={t('vs.deleteTip')} onClick={() => handleDelete(vs)}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 409: still referenced by conditions. Those have to be repointed first. */}
                                    {users && (
                                        <div className="vs-inuse">
                                            <AlertTriangle size={13} />
                                            <div>
                                                <strong>{t('vs.inUseTitle')}</strong>
                                                <span>{t('vs.inUseBody')}</span>
                                                {users.length > 0 && (
                                                    <div className="vs-inuse-list">
                                                        {users.map(a => <span className="vs-inuse-item" key={a.id}>{a.name}</span>)}
                                                    </div>
                                                )}
                                            </div>
                                            <button className="vs-inuse-x" onClick={() => setBlocked(prev => { const n = { ...prev }; delete n[vs.id]; return n; })}>
                                                <X size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {editor && createPortal(
                <div className="ae-overlay" onClick={() => setEditor(null)}>
                    <div className="ae-modal vs-modal panel" onClick={e => e.stopPropagation()}>
                        <div className="ae-header">
                            <h3><Sigma size={18} className="ae-wand" /> {editor.vs ? t('vs.editTitle') : t('vs.createTitle')}</h3>
                            <button type="button" className="ae-close" onClick={() => setEditor(null)}><X size={18} /></button>
                        </div>

                        <div className="ae-body">
                            <div className="ae-grid-2">
                                <div className="ae-field">
                                    <label>{t('vs.code')} *</label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        disabled={!!editor.vs}
                                        maxLength={VIRTUAL_SENSOR_CODE_MAX_LENGTH}
                                        placeholder="vs_internal_temp_min"
                                        onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                    />
                                    <span className="ae-hint">
                                        {editor.vs ? <><Lock size={11} className="vs-lock" /> {t('vs.codeLocked')}</> : t('vs.codeHint')}
                                    </span>
                                </div>
                                <div className="ae-field">
                                    <label>{t('vs.name')} *</label>
                                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                </div>
                            </div>

                            <div className="ae-grid-2">
                                <div className="ae-field">
                                    <label>{t('vs.agg')}</label>
                                    <div className="ae-logic-toggle">
                                        {AGGS.map(a => (
                                            <button type="button" key={a} className={form.agg === a ? 'active' : ''} onClick={() => setForm(f => ({ ...f, agg: a }))}>
                                                {t(`auto.agg.${a}`)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="ae-field">
                                    <label>{t('vs.unit')}</label>
                                    <input type="text" value={form.unit} placeholder="°C" onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
                                </div>
                            </div>

                            <div className="ae-field">
                                <label>{t('vs.sources')} *</label>
                                <div className="vs-source-picker">
                                    {form.sourceIds.map(rid => (
                                        <span className="vs-chip" key={rid} title={registerById[rid]?.code || rid}>
                                            <span className="vs-chip-name">{sourceLabel(rid)}</span>
                                            {registerById[rid]?.unit && <span className="vs-chip-unit">{registerById[rid].unit}</span>}
                                            <button type="button" className="vs-chip-x" onClick={() => removeSource(rid)}><X size={11} /></button>
                                        </span>
                                    ))}
                                    <select
                                        className="vs-chip-add"
                                        value=""
                                        disabled={!addable.length}
                                        onChange={e => { addSource(e.target.value); e.currentTarget.value = ''; }}
                                    >
                                        <option value="">{addable.length ? `+ ${t('vs.addSource')}` : t('vs.noMoreSources')}</option>
                                        {addable.map(x => (
                                            <option key={x.register.id} value={x.register.id}>
                                                {deviceLabels[x.device.id] || x.device.name}{x.register.unit ? ` (${x.register.unit})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <span className="ae-hint">{t('vs.sourcesHint')}</span>
                            </div>

                            <div className="ae-field">
                                <label>{t('detail.displayNamesJson')}</label>
                                <textarea
                                    className="ae-json" rows={3} spellCheck={false}
                                    placeholder={'{\n  "en": "Indoor temperature (min)",\n  "ko": "내부 최저 온도"\n}'}
                                    value={form.displayNamesStr}
                                    onChange={e => setForm(f => ({ ...f, displayNamesStr: e.target.value }))}
                                />
                                <span className="ae-hint">{t('auto.f.displayNamesHint')}</span>
                            </div>

                            {editor.vs && (
                                <label className="ae-check">
                                    <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                                    {t('vs.isActive')}
                                </label>
                            )}

                            <div className="vs-note">
                                <Info size={13} />
                                <span>{t('vs.republishNote')}</span>
                            </div>
                        </div>

                        <div className="ae-footer">
                            <span />
                            <div className="ae-footer-right">
                                <button type="button" className="ae-cancel" onClick={() => setEditor(null)}>{t('btn.cancel')}</button>
                                <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 className="spinner" size={14} /> : <Save size={15} />}
                                    {saving ? t('auto.saving') : t('btn.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
