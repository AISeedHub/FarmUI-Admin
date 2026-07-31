import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    X, Plus, Trash2, Loader2, Package, Save, Pencil, Lock, Info, Link2, ArrowRight,
} from 'lucide-react';
import HelpTip from '../../../components/HelpTip';
import { presetsApi } from '../../../api/services';
import { AutomationScene, PresetPackagePayload, PresetPackageRule } from '../../../types';
import { displayNamesToText, parseDisplayNamesText, localizedName } from '../../../utils/displayNames';
import AutomationEditorModal, { CopyCandidate } from './AutomationEditorModal';
import './PresetPackageModal.css';

// Editor-local wrapper so a rule keeps a stable React key while it is being reordered/edited.
interface DraftRule {
    _key: string;
    rule: PresetPackageRule;
}
let _seq = 0;

interface PresetPackageModalProps {
    farmId: string;
    // Create mode when null. In edit mode only the metadata is editable: a container
    // has no condition tree of its own (PUT /presets/{id}/full 422s on it).
    container?: AutomationScene | null;
    ruleCount?: number; // rules the container already holds (edit mode, display only)
    // Saved preset rules of this farm (no containers) — offered as clone sources when
    // authoring a rule, alongside the drafts of this package.
    copyableRules?: AutomationScene[];
    onClose: () => void;
    onSaved: () => void;
}

export default function PresetPackageModal({ farmId, container, ruleCount = 0, copyableRules = [], onClose, onSaved }: PresetPackageModalProps) {
    const { t, i18n } = useTranslation();
    const isEdit = !!container;

    const [name, setName] = useState(container?.name || '');
    const [description, setDescription] = useState(container?.description || '');
    const [displayNamesStr, setDisplayNamesStr] = useState(() => displayNamesToText(container?.display_names));
    const [exclusiveKey, setExclusiveKey] = useState(container?.exclusive_key || '');
    // A new package starts OFF: members switch it on from their dashboard.
    const [isEnabled, setIsEnabled] = useState(container?.is_enabled ?? false);

    // Rules drafted for a NEW package — they are POSTed together with the container.
    // Once the package exists its rules are managed from its row in the presets list
    // (one endpoint per rule), so this list stays empty in edit mode.
    const [drafts, setDrafts] = useState<DraftRule[]>([]);
    const [builderFor, setBuilderFor] = useState<{ key: string | null } | null>(null);
    const [saving, setSaving] = useState(false);

    const openNewRule = () => setBuilderFor({ key: null });
    const openEditRule = (key: string) => setBuilderFor({ key });

    const handleRuleSubmit = (rule: PresetPackageRule) => {
        const editingKey = builderFor?.key ?? null;
        setDrafts(prev => editingKey
            ? prev.map(d => d._key === editingKey ? { ...d, rule } : d)
            : [...prev, { _key: `pr${++_seq}`, rule }]);
        setBuilderFor(null);
    };

    const removeDraft = (key: string) => setDrafts(prev => prev.filter(d => d._key !== key));

    const handleSave = async () => {
        if (!name.trim()) { alert(t('preset.pkg.vName')); return; }
        if (!isEdit && drafts.length === 0) { alert(t('preset.pkg.vRules')); return; }

        // Blank entries of the pre-filled scaffold are dropped before sending.
        const dn = parseDisplayNamesText(displayNamesStr);
        if (!dn.ok) {
            alert(t('detail.invalidJson'));
            return;
        }
        const display_names = dn.value ?? undefined;

        setSaving(true);
        try {
            if (isEdit && container) {
                // exclusive_key is create-only server-side, so it is not sent here.
                await presetsApi.updateMeta(container.id, {
                    name: name.trim(),
                    description: description.trim(),
                    display_names,
                    is_enabled: isEnabled,
                } as Partial<AutomationScene>);
                alert(t('preset.pkg.updateSuccess'));
            } else {
                const payload: PresetPackagePayload = {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    display_names,
                    exclusive_key: exclusiveKey.trim() || undefined,
                    is_enabled: isEnabled,
                    rules: drafts.map(d => d.rule),
                };
                await presetsApi.createPackage(farmId, payload);
                alert(t('preset.pkg.createSuccess'));
            }
            onSaved();
        } catch (err: any) {
            alert(t('preset.actionFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const editingDraft = builderFor?.key ? drafts.find(d => d._key === builderFor.key) : undefined;

    // Clone sources for a new rule: the sibling drafts first (the common case — an ON
    // rule and its mirrored OFF rule), then any saved preset rule of the farm.
    const copySources: CopyCandidate[] = [
        ...drafts
            .filter(d => d._key !== builderFor?.key) // never offer the rule being edited
            .map((d, i) => ({
                key: d._key,
                name: d.rule.name || t('preset.pkg.ruleNo', { n: i + 1 }),
                rule: d.rule,
                group: t('preset.pkg.copyFromDrafts'),
            })),
        ...copyableRules.map(r => ({
            key: r.id,
            id: r.id,
            name: localizedName(r, i18n.language),
            group: t('preset.pkg.copyFromSaved'),
        })),
    ];

    return createPortal(
        <>
            <div className="ae-overlay" onClick={onClose}>
                <div className="ae-modal pp-modal panel" onClick={e => e.stopPropagation()}>
                    <div className="ae-header">
                        <h3><Package size={18} className="ae-wand" /> {isEdit ? t('preset.pkg.editTitle') : t('preset.pkg.createTitle')}</h3>
                        <button type="button" className="ae-close" onClick={onClose}><X size={18} /></button>
                    </div>

                    <div className="ae-body">
                        <p className="ae-section-hint">{isEdit ? t('preset.pkg.editSubtitle') : t('preset.pkg.createSubtitle')}</p>

                        <div className="ae-field">
                            <label>{t('preset.pkg.name')} *</label>
                            <input type="text" value={name} placeholder={t('preset.pkg.namePh')} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="ae-field">
                            <label>{t('preset.pkg.description')}</label>
                            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="ae-field">
                            <label>{t('detail.displayNamesJson')}</label>
                            <textarea
                                className="ae-json" rows={3} spellCheck={false}
                                placeholder={'{\n  "en": "Winter package",\n  "ko": "겨울 세트"\n}'}
                                value={displayNamesStr}
                                onChange={e => setDisplayNamesStr(e.target.value)}
                            />
                            <span className="ae-hint">{t('auto.f.displayNamesHint')}</span>
                        </div>

                        <div className="ae-field">
                            <div className="ae-label-row">
                                <label>{t('preset.pkg.exclusiveKey')}</label>
                                <HelpTip label={t('common.whatIsThis')}>
                                    <span className="help-tip-title">
                                        <Link2 size={14} /> {t('preset.pkg.exclusiveKey')}
                                    </span>
                                    <p>{t('preset.pkg.exclusiveHelpWhat')}</p>
                                    <p>{t('preset.pkg.exclusiveHelpWhen')}</p>
                                    <div className="help-tip-example">
                                        <span className="help-tip-example-hdr">{t('preset.pkg.exclusiveHelpExampleHdr')}</span>
                                        <code>season</code>
                                        <ul>
                                            <li>{t('preset.pkg.exclusiveHelpEx1')}</li>
                                            <li>{t('preset.pkg.exclusiveHelpEx2')}</li>
                                            <li>{t('preset.pkg.exclusiveHelpEx3')}</li>
                                        </ul>
                                        <span className="help-tip-effect">
                                            <ArrowRight size={13} /> {t('preset.pkg.exclusiveHelpEffect')}
                                        </span>
                                    </div>
                                    <p className="help-tip-note">{t('preset.pkg.exclusiveHelpEmpty')}</p>
                                    <p className="help-tip-note">{t('preset.pkg.exclusiveHelpRules')}</p>
                                </HelpTip>
                            </div>
                            <input
                                type="text"
                                maxLength={50}
                                value={exclusiveKey}
                                disabled={isEdit}
                                placeholder={t('preset.pkg.exclusiveKeyPh')}
                                onChange={e => setExclusiveKey(e.target.value)}
                            />
                            <span className="ae-hint">
                                {isEdit ? <><Lock size={11} className="pp-lock" /> {t('preset.pkg.exclusiveKeyLocked')}</> : t('preset.pkg.exclusiveKeyHint')}
                            </span>
                        </div>

                        <label className="ae-check">
                            <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} />
                            {t('preset.pkg.enableNow')}
                        </label>
                        <span className="ae-hint">{t('preset.pkg.enableHint')}</span>

                        {/* Rules */}
                        <div className="pp-rules">
                            <div className="pp-rules-head">
                                <span className="ae-summary-title">{t('preset.pkg.rulesTitle')}</span>
                                {isEdit
                                    ? <span className="pp-count">{t('preset.pkg.ruleCount', { count: ruleCount })}</span>
                                    : <span className="pp-count">{t('preset.pkg.ruleCount', { count: drafts.length })}</span>}
                            </div>

                            {isEdit ? (
                                <div className="pp-note">
                                    <Info size={13} />
                                    <span>{t('preset.pkg.editRulesNote')}</span>
                                </div>
                            ) : drafts.length === 0 ? (
                                <div className="ae-empty-box">{t('preset.pkg.noRules')}</div>
                            ) : (
                                <div className="pp-rule-list">
                                    {drafts.map((d, idx) => (
                                        <div className="pp-rule-row" key={d._key}>
                                            <span className="pp-rule-order">{idx + 1}</span>
                                            <div className="pp-rule-info">
                                                <span className="pp-rule-name">{d.rule.name || t('preset.pkg.unnamedRule')}</span>
                                                <span className="pp-rule-meta">
                                                    {t('preset.pkg.ruleMeta', {
                                                        conditions: d.rule.condition_groups?.[0]?.conditions?.length ?? 0,
                                                        actions: d.rule.actions?.length ?? 0,
                                                    })}
                                                    <span className="pp-rule-mode">{d.rule.evaluation_mode}</span>
                                                </span>
                                            </div>
                                            <button type="button" className="pp-icon-btn" title={t('btn.edit')} onClick={() => openEditRule(d._key)}>
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" className="pp-icon-btn danger" title={t('btn.delete')} onClick={() => removeDraft(d._key)}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!isEdit && (
                                <button type="button" className="ae-add-toggle" onClick={openNewRule}>
                                    <Plus size={16} /> {t('preset.pkg.addRule')}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="ae-footer">
                        <span />
                        <div className="ae-footer-right">
                            <button type="button" className="ae-cancel" onClick={onClose}>{t('btn.cancel')}</button>
                            <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="spinner" size={14} /> : <Save size={15} />}
                                {saving ? t('auto.saving') : (isEdit ? t('preset.pkg.saveMeta') : t('preset.pkg.savePackage'))}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Same rule form builder as everywhere else — here it hands the payload back
                instead of saving, so a whole package can be POSTed in one call. */}
            {builderFor && (
                <AutomationEditorModal
                    farmId={farmId}
                    automationId={null}
                    // Targets for a "Run another automation" action.
                    automations={copyableRules}
                    mode="preset"
                    nested
                    builder={{
                        initial: editingDraft?.rule ?? null,
                        onSubmit: handleRuleSubmit,
                        title: editingDraft ? t('preset.pkg.editRuleTitle') : t('preset.pkg.newRuleTitle'),
                        submitLabel: t('preset.pkg.keepRule'),
                        copySources,
                    }}
                    onClose={() => setBuilderFor(null)}
                    onSaved={() => setBuilderFor(null)}
                />
            )}
        </>,
        document.body
    );
}
