import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Layers, Plus, Pencil, Trash2, Sliders, Loader2, AlertTriangle, RefreshCw,
    ChevronDown, ChevronRight, Check, X, Package, FileText, Link2, History,
} from 'lucide-react';
import { presetsApi } from '../../../api/services';
import { AutomationScene, PresetTunable, PresetTuneValue } from '../../../types';
import { localizedName } from '../../../utils/displayNames';
import AutomationEditorModal from './AutomationEditorModal';
import PresetPackageModal from './PresetPackageModal';
import PresetHistoryModal, { HistorySource } from './PresetHistoryModal';
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

// A row in the panel: either a package (container + its child rules) or a
// standalone single-rule preset. GET /farms/{id}/presets returns one flat list —
// containers carry is_group, their rules carry preset_group_id.
interface PresetEntry {
    row: AutomationScene;
    children: AutomationScene[];
    isPackage: boolean;
}

// What the history modal is showing. Resolved at click time so the modal never
// has to know about packages: it just merges the rules it is handed.
interface HistoryTarget {
    key: string;
    title: string;
    description?: string | null;
    isEnabled: boolean;
    sources: HistorySource[];
    showRuleTag: boolean;
}

export default function PresetsPanel({ farmId }: PresetsPanelProps) {
    const { t, i18n } = useTranslation();
    // Read-only labels come from display_names so switching language switches them;
    // the raw `name` stays the canonical value edited in the forms.
    const nameOf = (p: AutomationScene) => localizedName(p, i18n.language);

    const [presets, setPresets] = useState<AutomationScene[]>([]);
    const [tunablesById, setTunablesById] = useState<Record<string, PresetTunable[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Rule editor (null editId = create). `editParent` marks a rule that belongs to a package.
    const [editorOpen, setEditorOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    // Package editor: 'new' = create, or the container being edited.
    const [packageModal, setPackageModal] = useState<{ container: AutomationScene | null } | null>(null);
    // "New preset" split menu (package vs single rule).
    const [showNewMenu, setShowNewMenu] = useState(false);
    // Appending a rule to an existing package (the whole entry, so its sibling rules
    // can be offered as clone sources).
    const [appendTo, setAppendTo] = useState<PresetEntry | null>(null);

    // Which packages are expanded to show their rules.
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    // Execution history modal (null = closed).
    const [historyFor, setHistoryFor] = useState<HistoryTarget | null>(null);

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

    // Group the flat list into packages + standalone presets, preserving server order.
    const entries = useMemo<PresetEntry[]>(() => {
        const childrenOf: Record<string, AutomationScene[]> = {};
        presets.forEach(p => {
            if (p.preset_group_id) {
                (childrenOf[p.preset_group_id] ||= []).push(p);
            }
        });
        return presets
            .filter(p => !p.preset_group_id)
            .map(row => ({
                row,
                children: childrenOf[row.id] || [],
                // A container is flagged by the server; treat a row that has children as
                // one too, so an older payload without is_group still renders correctly.
                isPackage: !!row.is_group || (childrenOf[row.id]?.length ?? 0) > 0,
            }));
    }, [presets]);

    // Every preset row that actually has a condition tree: standalone presets and the
    // rules inside packages. Containers are excluded — there is nothing to clone or run.
    const copyableRules = useMemo(() => presets.filter(p => !p.is_group), [presets]);

    // Tunables of a package = its own plus every child rule's, whichever shape the
    // member view returns them in.
    const tunablesFor = (entry: PresetEntry): PresetTunable[] => {
        const own = tunablesById[entry.row.id] || [];
        if (!entry.isPackage) return own;
        const seen = new Set(own.map(t => t.condition_id));
        const merged = [...own];
        entry.children.forEach(child => (tunablesById[child.id] || []).forEach(tn => {
            if (!seen.has(tn.condition_id)) { seen.add(tn.condition_id); merged.push(tn); }
        }));
        return merged;
    };

    // Which preset row owns a given tunable — the tune endpoint is per-preset, so a
    // package's thresholds have to be applied against the child rule that holds them.
    const ownerOfTunable = (entry: PresetEntry, conditionId: string): string => {
        if ((tunablesById[entry.row.id] || []).some(tn => tn.condition_id === conditionId)) return entry.row.id;
        const child = entry.children.find(c => (tunablesById[c.id] || []).some(tn => tn.condition_id === conditionId));
        return child?.id || entry.row.id;
    };

    // History of a whole row. A container never fires — its child rules do — so a
    // package merges every rule's executions into one time-ordered stream.
    const openHistory = (entry: PresetEntry) => setHistoryFor({
        key: entry.row.id,
        title: nameOf(entry.row),
        description: entry.row.description,
        isEnabled: entry.row.is_enabled,
        sources: entry.isPackage
            ? entry.children.map(c => ({ id: c.id, name: nameOf(c) }))
            : [{ id: entry.row.id, name: nameOf(entry.row) }],
        showRuleTag: entry.isPackage,
    });

    // History of one rule inside a package.
    const openRuleHistory = (child: AutomationScene) => setHistoryFor({
        key: child.id,
        title: nameOf(child),
        description: child.description,
        isEnabled: child.is_enabled,
        sources: [{ id: child.id, name: nameOf(child) }],
        showRuleTag: false,
    });

    const openCreateSingle = () => { setShowNewMenu(false); setEditId(null); setEditorOpen(true); };
    const openCreatePackage = () => { setShowNewMenu(false); setPackageModal({ container: null }); };
    const openEditRule = (p: AutomationScene) => { setEditId(p.id); setEditorOpen(true); };
    const handleEditorSaved = () => { setEditorOpen(false); loadData(); };

    const handleDelete = async (entry: PresetEntry) => {
        const { row, children, isPackage } = entry;
        if (isPackage) {
            // Deleting a container cascades to every rule inside it — confirm twice and
            // say how many rules are about to go.
            if (!window.confirm(t('preset.pkg.deleteConfirm1', { name: nameOf(row), count: children.length }))) return;
            if (!window.confirm(t('preset.pkg.deleteConfirm2', { count: children.length }))) return;
        } else if (!window.confirm(t('preset.deleteConfirm'))) {
            return;
        }
        try {
            await presetsApi.delete(row.id);
            loadData();
        } catch (err: any) {
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    const handleDeleteChild = async (child: AutomationScene) => {
        if (!window.confirm(t('preset.pkg.deleteRuleConfirm', { name: nameOf(child) }))) return;
        try {
            await presetsApi.delete(child.id);
            loadData();
        } catch (err: any) {
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    // Enable/disable via the dedicated member endpoint (optimistic; revert on failure).
    // For a row with an exclusive_key the server also switches off the farm's other
    // presets sharing that key, so the list is reloaded to pick those up.
    const handleToggle = async (p: AutomationScene) => {
        const next = !p.is_enabled;
        setTogglingId(p.id);
        setPresets(prev => prev.map(x => x.id === p.id ? { ...x, is_enabled: next } : x));
        try {
            await presetsApi.setEnabled(farmId, p.id, next);
            if (next && p.exclusive_key) await loadData();
        } catch (err: any) {
            setPresets(prev => prev.map(x => x.id === p.id ? { ...x, is_enabled: p.is_enabled } : x));
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setTogglingId(null);
        }
    };

    const openTune = (entry: PresetEntry) => {
        if (tuneId === entry.row.id) { setTuneId(null); return; }
        const draft: Record<string, number> = {};
        tunablesFor(entry).forEach(tn => { draft[tn.condition_id] = tn.current_value; });
        setTuneDraft(draft);
        setTuneId(entry.row.id);
    };

    const setDraftValue = (conditionId: string, value: number) => {
        setTuneDraft(prev => ({ ...prev, [conditionId]: value }));
    };

    const handleApplyTune = async (entry: PresetEntry) => {
        const tunables = tunablesFor(entry);
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
        // Only send values that actually changed, grouped by the preset row that owns them.
        const byOwner: Record<string, PresetTuneValue[]> = {};
        tunables
            .filter(tn => Number(tuneDraft[tn.condition_id]) !== tn.current_value)
            .forEach(tn => {
                const owner = ownerOfTunable(entry, tn.condition_id);
                (byOwner[owner] ||= []).push({ condition_id: tn.condition_id, value: Number(tuneDraft[tn.condition_id]) });
            });

        const owners = Object.keys(byOwner);
        if (owners.length === 0) { setTuneId(null); return; }

        setSavingTune(true);
        try {
            for (const owner of owners) {
                await presetsApi.tune(farmId, owner, byOwner[owner]);
            }
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
                <div className="actions preset-new-wrap">
                    <button className="primary-btn flex-center" onClick={() => setShowNewMenu(v => !v)}>
                        <Plus size={14} /> {t('preset.newPreset')}
                        <ChevronDown size={13} className={`chev ${showNewMenu ? 'open' : ''}`} />
                    </button>
                    {showNewMenu && (
                        <div className="preset-new-menu">
                            <button onClick={openCreatePackage}>
                                <Package size={15} />
                                <span>
                                    <strong>{t('preset.pkg.newPackage')}</strong>
                                    <small>{t('preset.pkg.newPackageDesc')}</small>
                                </span>
                            </button>
                            <button onClick={openCreateSingle}>
                                <FileText size={15} />
                                <span>
                                    <strong>{t('preset.newSingle')}</strong>
                                    <small>{t('preset.newSingleDesc')}</small>
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {entries.length === 0 ? (
                <div className="presets-empty">
                    <Layers size={26} />
                    <p>{t('preset.empty')}</p>
                    <button className="secondary-btn flex-center" onClick={openCreatePackage}>
                        <Plus size={14} /> {t('preset.pkg.newPackage')}
                    </button>
                </div>
            ) : (
                <div className="presets-list">
                    {entries.map(entry => {
                        const p = entry.row;
                        const tunables = tunablesFor(entry);
                        const isTuneOpen = tuneId === p.id;
                        const isOpen = !!expanded[p.id];
                        return (
                            <div className={`preset-card ${entry.isPackage ? 'is-package' : ''}`} key={p.id}>
                                <div className="preset-main">
                                    <div className="preset-info">
                                        <div className="preset-name-row">
                                            {entry.isPackage ? (
                                                <button
                                                    className="preset-expand"
                                                    onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                                    title={t(isOpen ? 'preset.pkg.collapse' : 'preset.pkg.expand')}
                                                >
                                                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                            ) : (
                                                <span className={`dot ${p.is_enabled ? 'active' : 'inactive'}`}></span>
                                            )}
                                            <span className="preset-name" title={p.name}>{nameOf(p)}</span>
                                            {entry.isPackage && (
                                                <span className="package-tag" title={t('preset.pkg.tagTip')}>
                                                    <Package size={11} /> {t('preset.pkg.ruleCount', { count: entry.children.length })}
                                                </span>
                                            )}
                                            {!entry.isPackage && <span className="priority-tag managed" title={t('preset.priorityBandTip')}>P{p.priority}</span>}
                                            {p.exclusive_key && (
                                                <span className="exclusive-tag" title={t('preset.pkg.exclusiveTip', { key: p.exclusive_key })}>
                                                    <Link2 size={11} /> {p.exclusive_key}
                                                </span>
                                            )}
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
                                            title={entry.isPackage ? t('preset.pkg.toggleTip') : t('preset.toggleTip')}
                                        >
                                            <div className="knob"></div>
                                        </div>
                                        {tunables.length > 0 && (
                                            <button
                                                className={`history-btn ${isTuneOpen ? 'active' : ''}`}
                                                onClick={() => openTune(entry)}
                                                title={t('preset.tuneTip')}
                                            >
                                                <Sliders size={12} />
                                                <span>{t('preset.tune')}</span>
                                                <ChevronDown size={12} className={`chev ${isTuneOpen ? 'open' : ''}`} />
                                            </button>
                                        )}
                                        {entry.isPackage && (
                                            <button className="history-btn" title={t('preset.pkg.addRuleTip')} onClick={() => setAppendTo(entry)}>
                                                <Plus size={12} />
                                                <span>{t('preset.pkg.rule')}</span>
                                            </button>
                                        )}
                                        <button
                                            className="history-btn"
                                            title={entry.isPackage ? t('preset.pkg.historyTip') : t('preset.historyTip')}
                                            onClick={() => openHistory(entry)}
                                        >
                                            <History size={12} />
                                            <span>{t('preset.history')}</span>
                                        </button>
                                        <button
                                            className="history-btn icon-only"
                                            title={entry.isPackage ? t('preset.pkg.editTip') : t('preset.editTip')}
                                            onClick={() => entry.isPackage ? setPackageModal({ container: p }) : openEditRule(p)}
                                        >
                                            <Pencil size={12} />
                                        </button>
                                        <button
                                            className="history-btn icon-only danger"
                                            title={entry.isPackage ? t('preset.pkg.deleteTip') : t('preset.deleteTip')}
                                            onClick={() => handleDelete(entry)}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Child rules of a package. The container has no condition tree of
                                    its own — each rule is edited (and deleted) individually. */}
                                {entry.isPackage && isOpen && (
                                    <div className="preset-rules">
                                        {entry.children.length === 0 ? (
                                            <div className="preset-rules-empty">{t('preset.pkg.noRulesYet')}</div>
                                        ) : entry.children.map((child, idx) => (
                                            <div className="preset-rule-row" key={child.id}>
                                                <span className="preset-rule-order">{idx + 1}</span>
                                                <span className={`dot ${child.is_enabled ? 'active' : 'inactive'}`} title={t('preset.pkg.ruleStateTip')}></span>
                                                <div className="preset-rule-info">
                                                    <span className="preset-rule-name" title={child.name}>{nameOf(child)}</span>
                                                    {child.description && <span className="preset-rule-desc">{child.description}</span>}
                                                </div>
                                                <span className="priority-tag managed">P{child.priority}</span>
                                                <button className="history-btn icon-only" title={t('preset.historyTip')} onClick={() => openRuleHistory(child)}>
                                                    <History size={12} />
                                                </button>
                                                <button className="history-btn icon-only" title={t('preset.editTip')} onClick={() => openEditRule(child)}>
                                                    <Pencil size={12} />
                                                </button>
                                                <button className="history-btn icon-only danger" title={t('preset.pkg.deleteRuleTip')} onClick={() => handleDeleteChild(child)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

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
                                            <button className="primary-btn flex-center" onClick={() => handleApplyTune(entry)} disabled={savingTune}>
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

            {/* Execution history. `key` remounts it when another preset is picked, so
                the fetch stays a mount-time concern. */}
            {historyFor && (
                <PresetHistoryModal
                    key={historyFor.key}
                    farmId={farmId}
                    title={historyFor.title}
                    description={historyFor.description}
                    isEnabled={historyFor.isEnabled}
                    sources={historyFor.sources}
                    showRuleTag={historyFor.showRuleTag}
                    onClose={() => setHistoryFor(null)}
                />
            )}

            {editorOpen && (
                <AutomationEditorModal
                    farmId={farmId}
                    automationId={editId}
                    // Copy-from list: only standalone presets and package rules have a tree.
                    automations={copyableRules}
                    mode="preset"
                    onClose={() => setEditorOpen(false)}
                    onSaved={handleEditorSaved}
                />
            )}

            {packageModal && (
                <PresetPackageModal
                    farmId={farmId}
                    container={packageModal.container}
                    ruleCount={packageModal.container
                        ? entries.find(e => e.row.id === packageModal.container!.id)?.children.length ?? 0
                        : 0}
                    copyableRules={copyableRules}
                    onClose={() => setPackageModal(null)}
                    onSaved={() => { setPackageModal(null); loadData(); }}
                />
            )}

            {/* Append one rule to an existing package: same builder, POSTed to
                /presets/{container}/rules instead of being kept in a draft list. */}
            {appendTo && (
                <AutomationEditorModal
                    farmId={farmId}
                    automationId={null}
                    // Targets for a "Run another automation" action.
                    automations={copyableRules}
                    mode="preset"
                    builder={{
                        title: t('preset.pkg.addRuleTo', { name: nameOf(appendTo.row) }),
                        submitLabel: t('preset.pkg.appendRule'),
                        // Sibling rules of this package first — cloning an ON rule into its
                        // mirrored OFF rule is the common case — then the rest of the farm.
                        copySources: [
                            ...appendTo.children.map(r => ({
                                key: r.id, id: r.id, name: nameOf(r), group: t('preset.pkg.copyFromPackage'),
                            })),
                            ...copyableRules
                                .filter(r => r.preset_group_id !== appendTo.row.id)
                                .map(r => ({
                                    key: r.id, id: r.id, name: nameOf(r), group: t('preset.pkg.copyFromSaved'),
                                })),
                        ],
                        onSubmit: async rule => {
                            const containerId = appendTo.row.id;
                            await presetsApi.addRule(containerId, rule);
                            setExpanded(prev => ({ ...prev, [containerId]: true }));
                            setAppendTo(null);
                            await loadData();
                        },
                    }}
                    onClose={() => setAppendTo(null)}
                    onSaved={() => setAppendTo(null)}
                />
            )}
        </div>
        </div>
    );
}
