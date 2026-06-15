import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Layers, Plus, Pencil, Trash2, Sliders, Loader2, AlertTriangle, RefreshCw,
    ChevronDown, Check, X,
} from 'lucide-react';
import { presetsApi } from '../../../api/services';
import { AutomationScene, PresetTunable, PresetTuneValue } from '../../../types';
import AutomationEditorModal from './AutomationEditorModal';
import './PresetsPanel.css';

interface PresetsPanelProps {
    farmId: string;
}

// Resolve the effective [min, max] a member may tune within: expert band first,
// falling back to the register's hard bounds when an expert bound is unset.
const tuneBounds = (tn: PresetTunable): { min: number | null; max: number | null } => ({
    min: tn.tunable_min ?? tn.register_min ?? null,
    max: tn.tunable_max ?? tn.register_max ?? null,
});

export default function PresetsPanel({ farmId }: PresetsPanelProps) {
    const { t } = useTranslation();

    const [presets, setPresets] = useState<AutomationScene[]>([]);
    const [tunablesById, setTunablesById] = useState<Record<string, PresetTunable[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Editor (null editId = create)
    const [editorOpen, setEditorOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    // Inline tune panel: which preset is expanded + draft values keyed by condition_id.
    const [tuneId, setTuneId] = useState<string | null>(null);
    const [tuneDraft, setTuneDraft] = useState<Record<string, number>>({});
    const [savingTune, setSavingTune] = useState(false);

    // Which preset's enable toggle is mid-flight (disables the control).
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        if (farmId) loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [farmId]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Authoring list is authoritative for the rows; tunables come from the
            // member "available" view (super_admin always passes). Degrade gracefully
            // if the available endpoint 403s/fails so the table still renders.
            const availablePromise = presetsApi.getAvailable(farmId).catch(err => {
                console.warn('Failed to load preset tunables:', err);
                return [];
            });
            const [rows, available] = await Promise.all([
                presetsApi.getByFarm(farmId),
                availablePromise,
            ]);
            setPresets(rows);
            const map: Record<string, PresetTunable[]> = {};
            available.forEach(p => { map[p.id] = p.tunables; });
            setTunablesById(map);
        } catch (err: any) {
            console.error('Failed to load presets:', err);
            setError(err?.message || 'Failed to load presets');
        } finally {
            setLoading(false);
        }
    };

    const openCreate = () => { setEditId(null); setEditorOpen(true); };
    const openEdit = (p: AutomationScene) => { setEditId(p.id); setEditorOpen(true); };
    const handleEditorSaved = () => { setEditorOpen(false); loadData(); };

    const handleDelete = async (p: AutomationScene) => {
        if (!window.confirm(t('preset.deleteConfirm'))) return;
        try {
            await presetsApi.delete(p.id);
            loadData();
        } catch (err: any) {
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    // Enable/disable via the dedicated member endpoint (optimistic; revert on failure).
    const handleToggle = async (p: AutomationScene) => {
        const next = !p.is_enabled;
        setTogglingId(p.id);
        setPresets(prev => prev.map(x => x.id === p.id ? { ...x, is_enabled: next } : x));
        try {
            await presetsApi.setEnabled(farmId, p.id, next);
        } catch (err: any) {
            setPresets(prev => prev.map(x => x.id === p.id ? { ...x, is_enabled: p.is_enabled } : x));
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setTogglingId(null);
        }
    };

    const openTune = (p: AutomationScene) => {
        if (tuneId === p.id) { setTuneId(null); return; }
        const draft: Record<string, number> = {};
        (tunablesById[p.id] || []).forEach(tn => { draft[tn.condition_id] = tn.current_value; });
        setTuneDraft(draft);
        setTuneId(p.id);
    };

    const setDraftValue = (conditionId: string, value: number) => {
        setTuneDraft(prev => ({ ...prev, [conditionId]: value }));
    };

    const handleApplyTune = async (p: AutomationScene) => {
        const tunables = tunablesById[p.id] || [];
        // Client-side bound check mirrors the backend so we fail fast with a clear message.
        for (const tn of tunables) {
            const v = Number(tuneDraft[tn.condition_id]);
            if (Number.isNaN(v)) { alert(t('preset.vTunableValue')); return; }
            const { min, max } = tuneBounds(tn);
            if ((min !== null && v < min) || (max !== null && v > max)) {
                alert(t('preset.tuneOutOfBounds', { label: tn.label || tn.condition_id, min: min ?? '−∞', max: max ?? '∞' }));
                return;
            }
        }
        // Only send values that actually changed.
        const values: PresetTuneValue[] = tunables
            .filter(tn => Number(tuneDraft[tn.condition_id]) !== tn.current_value)
            .map(tn => ({ condition_id: tn.condition_id, value: Number(tuneDraft[tn.condition_id]) }));

        if (values.length === 0) { setTuneId(null); return; }

        setSavingTune(true);
        try {
            await presetsApi.tune(farmId, p.id, values);
            setTuneId(null);
            await loadData();
        } catch (err: any) {
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSavingTune(false);
        }
    };

    if (loading) {
        return (
            <div className="presets-tab">
                <div className="presets-panel panel loading-state">
                    <Loader2 className="spinner" size={22} />
                    <span>{t('common.loading')}</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="presets-tab">
                <div className="presets-panel panel error-state">
                    <AlertTriangle size={22} />
                    <span>{error}</span>
                    <button className="secondary-btn" onClick={loadData}>
                        <RefreshCw size={14} /> {t('preset.retry')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="presets-tab">
        <div className="presets-panel panel">
            <div className="section-header">
                <div>
                    <h3><Layers size={16} className="presets-title-icon" /> {t('preset.title')}</h3>
                    <p>{t('preset.desc')}</p>
                </div>
                <div className="actions">
                    <button className="primary-btn flex-center" onClick={openCreate}>
                        <Plus size={14} /> {t('preset.newPreset')}
                    </button>
                </div>
            </div>

            {presets.length === 0 ? (
                <div className="presets-empty">
                    <Layers size={26} />
                    <p>{t('preset.empty')}</p>
                    <button className="secondary-btn flex-center" onClick={openCreate}>
                        <Plus size={14} /> {t('preset.newPreset')}
                    </button>
                </div>
            ) : (
                <div className="presets-list">
                    {presets.map(p => {
                        const tunables = tunablesById[p.id] || [];
                        const isTuneOpen = tuneId === p.id;
                        return (
                            <div className="preset-card" key={p.id}>
                                <div className="preset-main">
                                    <div className="preset-info">
                                        <div className="preset-name-row">
                                            <span className={`dot ${p.is_enabled ? 'active' : 'inactive'}`}></span>
                                            <span className="preset-name">{p.name}</span>
                                            <span className="priority-tag managed" title={t('preset.priorityBandTip')}>P{p.priority}</span>
                                            {tunables.length > 0 && (
                                                <span className="tunable-tag">
                                                    <Sliders size={11} /> {t('preset.tunableCount', { count: tunables.length })}
                                                </span>
                                            )}
                                        </div>
                                        <div className="preset-description">{p.description || t('preset.noDescription')}</div>
                                    </div>
                                    <div className="preset-controls">
                                        <span className={`status-badge ${p.is_enabled ? 'enabled' : 'disabled'}`}>
                                            {p.is_enabled ? t('preset.enabledOn') : t('preset.enabledOff')}
                                        </span>
                                        <div
                                            className={`toggle ${p.is_enabled ? 'on' : 'off'} ${togglingId === p.id ? 'busy' : ''}`}
                                            onClick={() => togglingId === p.id ? undefined : handleToggle(p)}
                                            title={t('preset.toggleTip')}
                                        >
                                            <div className="knob"></div>
                                        </div>
                                        {tunables.length > 0 && (
                                            <button
                                                className={`history-btn ${isTuneOpen ? 'active' : ''}`}
                                                onClick={() => openTune(p)}
                                                title={t('preset.tuneTip')}
                                            >
                                                <Sliders size={12} />
                                                <span>{t('preset.tune')}</span>
                                                <ChevronDown size={12} className={`chev ${isTuneOpen ? 'open' : ''}`} />
                                            </button>
                                        )}
                                        <button className="history-btn icon-only" title={t('preset.editTip')} onClick={() => openEdit(p)}>
                                            <Pencil size={12} />
                                        </button>
                                        <button className="history-btn icon-only danger" title={t('preset.deleteTip')} onClick={() => handleDelete(p)}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                {isTuneOpen && (
                                    <div className="preset-tune-panel">
                                        <div className="tune-panel-head">
                                            <Sliders size={13} />
                                            <span>{t('preset.tuneThresholds')}</span>
                                        </div>
                                        <div className="tune-rows">
                                            {tunables.map(tn => {
                                                const { min, max } = tuneBounds(tn);
                                                return (
                                                    <div className="tune-row" key={tn.condition_id}>
                                                        <div className="tune-label">
                                                            <span className="tune-name">{tn.label || tn.condition_id.slice(0, 8)}</span>
                                                            {tn.operator && <span className="tune-op">{tn.operator}</span>}
                                                        </div>
                                                        <div className="tune-input-wrap">
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                min={min ?? undefined}
                                                                max={max ?? undefined}
                                                                value={Number.isNaN(tuneDraft[tn.condition_id]) ? '' : (tuneDraft[tn.condition_id] ?? tn.current_value)}
                                                                onChange={e => setDraftValue(tn.condition_id, e.target.value === '' ? NaN : Number(e.target.value))}
                                                            />
                                                            {tn.unit && <span className="tune-unit">{tn.unit}</span>}
                                                        </div>
                                                        <span className="tune-bounds">
                                                            {t('preset.range')}: {min ?? '−∞'} … {max ?? '∞'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="tune-actions">
                                            <button className="secondary-btn flex-center" onClick={() => setTuneId(null)} disabled={savingTune}>
                                                <X size={13} /> {t('preset.cancel')}
                                            </button>
                                            <button className="primary-btn flex-center" onClick={() => handleApplyTune(p)} disabled={savingTune}>
                                                {savingTune ? <Loader2 className="spinner" size={13} /> : <Check size={13} />}
                                                {t('preset.applyTune')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {editorOpen && (
                <AutomationEditorModal
                    farmId={farmId}
                    automationId={editId}
                    automations={presets}
                    mode="preset"
                    onClose={() => setEditorOpen(false)}
                    onSaved={handleEditorSaved}
                />
            )}
        </div>
        </div>
    );
}
