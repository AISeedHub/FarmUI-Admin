import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    X, Plus, Trash2, Loader2, AlertTriangle, Wand2, Fan, Copy, ChevronRight,
    Clock, Hourglass, CalendarDays, Sunrise, Gauge, Plug, Bell, Timer, Workflow,
    ArrowLeft, ArrowRight, Save, Sliders,
} from 'lucide-react';
import { automationsApi, presetsApi, devicesApi, registersApi, usersApi } from '../../../api/services';
import {
    AutomationScene,
    AutomationDetail,
    UserResponse,
    AutomationCreatePayload,
    AutomationConditionGroup,
    AutomationCondition,
    AutomationAction,
    ConditionType,
    AutomationActionType,
    LogicalOp,
    EvaluationMode,
    Device,
    Register,
} from '../../../types';
import './AutomationEditorModal.css';

// ── Editor-local types: shared model + stable React key + ephemeral picker state ──
let _keySeq = 0;
const newKey = () => `ae${++_keySeq}`;

type CondCategory = 'sensor' | 'device';

interface ECondition extends AutomationCondition {
    _key: string;
    _deviceId?: string; // device that owns register_id (cascade helper, not serialized)
    _category?: CondCategory; // drives device-list filtering for register_value
}
interface EGroup {
    _key: string;
    logical_op: LogicalOp;
    conditions: ECondition[];
}
interface EAction extends AutomationAction {
    _key: string;
    _mode: 'device' | 'register'; // for set_register_value
    _deviceId?: string; // device that owns target_register_id in register mode
}

const OPERATORS = ['>', '>=', '<', '<=', '==', '!='];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Condition picker catalogue (friendly categories → underlying condition_type).
const COND_CATALOGUE: Array<{ key: string; type: ConditionType; category?: CondCategory; icon: any; group: 'time' | 'sensor' | 'device' }> = [
    { key: 'time_of_day', type: 'time_of_day', icon: Clock, group: 'time' },
    { key: 'time_range', type: 'time_range', icon: Hourglass, group: 'time' },
    { key: 'day_of_week', type: 'day_of_week', icon: CalendarDays, group: 'time' },
    { key: 'sun_event', type: 'sun_event', icon: Sunrise, group: 'time' },
    { key: 'sensor', type: 'register_value', category: 'sensor', icon: Gauge, group: 'sensor' },
    { key: 'device', type: 'register_value', category: 'device', icon: Plug, group: 'device' },
];

const ACTION_CATALOGUE: Array<{ type: AutomationActionType; icon: any }> = [
    { type: 'set_register_value', icon: Plug },
    { type: 'notification', icon: Bell },
    { type: 'delay', icon: Timer },
    { type: 'run_automation', icon: Workflow },
];

const defaultParams = (type: ConditionType): Record<string, any> => {
    switch (type) {
        case 'time_of_day': return { time: '06:00', match: 'equals' };
        case 'time_range': return { start: '08:00', end: '18:00' };
        case 'day_of_week': return { days: [] };
        case 'sun_event': return { event: 'sunrise', offset_minutes: 0 };
        case 'register_value': return { operator: '>', value: 0 };
        default: return {};
    }
};

const makeCondition = (type: ConditionType, category?: CondCategory): ECondition => ({
    _key: newKey(),
    condition_type: type,
    register_id: type === 'register_value' ? '' : null,
    params: defaultParams(type),
    is_negated: false,
    _category: category,
});

const makeGroup = (logical_op: LogicalOp = 'AND'): EGroup => ({
    _key: newKey(),
    logical_op,
    conditions: [],
});

const makeAction = (type: AutomationActionType = 'set_register_value'): EAction => ({
    _key: newKey(),
    action_type: type,
    _mode: 'device',
    target_device_id: '',
    value: type === 'set_register_value' ? 0 : null,
    params: {},
    delay_seconds_before: 0,
});

// label key for a condition card / picker item
const condCatLabelKey = (type: ConditionType, category?: CondCategory) =>
    type === 'register_value' ? (category === 'device' ? 'auto.cat.device' : 'auto.cat.sensor') : `auto.cat.${type}`;

type Step = 1 | 2 | 3;

// Preset priority band floor (mirrors backend preset_priority_floor default).
// Presets always sort above user automations; the value is clamped server-side anyway.
const PRESET_PRIORITY_FLOOR = 10000;

interface AutomationEditorModalProps {
    farmId: string;
    automationId: string | null; // null = create
    automations: AutomationScene[]; // for copy-from list + run_automation target
    mode?: 'automation' | 'preset'; // 'preset' → expert-authored preset CRUD
    onClose: () => void;
    onSaved: () => void;
}

export default function AutomationEditorModal({ farmId, automationId, automations, mode = 'automation', onClose, onSaved }: AutomationEditorModalProps) {
    const { t } = useTranslation();
    const isEdit = !!automationId;
    const isPreset = mode === 'preset';
    // Route detail reads to the right resource (presets live under /presets/*).
    const fetchDetail = (id: string): Promise<AutomationDetail> =>
        isPreset ? presetsApi.getById(id) : automationsApi.getById(id);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // 'entry' = the start-from-scratch / copy picker (create only); 'wizard' = the 3-step form.
    const [view, setView] = useState<'entry' | 'wizard'>('wizard');
    const [step, setStep] = useState<Step>(1);

    // Reference data
    const [devices, setDevices] = useState<Device[]>([]);
    const [registersByDevice, setRegistersByDevice] = useState<Record<string, Register[]>>({});
    const [users, setUsers] = useState<Record<string, UserResponse>>({});

    // Audit (edit mode): who created / last updated this scene
    const [audit, setAudit] = useState<{ created_by?: string | null; updated_by?: string | null }>({});

    // Metadata
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [displayNamesStr, setDisplayNamesStr] = useState('');
    const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>('edge');
    const [priority, setPriority] = useState(isPreset ? PRESET_PRIORITY_FLOOR : 1);
    const [isEnabled, setIsEnabled] = useState(true);

    // Tree + actions
    const [rootGroup, setRootGroup] = useState<EGroup>(makeGroup('AND'));
    const [actions, setActions] = useState<EAction[]>([]);

    // Pickers
    const [showCondPicker, setShowCondPicker] = useState(false);
    const [showActionPicker, setShowActionPicker] = useState(false);

    // Copy-from preview popover
    const [hover, setHover] = useState<{ id: string; top: number; left: number } | null>(null);
    const [previewCache, setPreviewCache] = useState<Record<string, AutomationDetail>>({});

    const deviceById = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])) as Record<string, Device>, [devices]);
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

    useEffect(() => {
        let cancelled = false;

        const buildRegisterMap = async (devs: Device[]) => {
            const entries = await Promise.all(
                devs.map(async (d) => {
                    try { return [d.id, await registersApi.getByDevice(d.id)] as const; }
                    catch { return [d.id, [] as Register[]] as const; }
                })
            );
            return Object.fromEntries(entries) as Record<string, Register[]>;
        };

        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const devs = await devicesApi.getByFarm(farmId);
                const [regMap, usersList] = await Promise.all([
                    buildRegisterMap(devs),
                    usersApi.getAll().catch(() => [] as UserResponse[]),
                ]);
                if (cancelled) return;
                setDevices(devs);
                setRegistersByDevice(regMap);
                const umap: Record<string, UserResponse> = {};
                usersList.forEach(u => { umap[u.id] = u; });
                setUsers(umap);

                const regToDev: Record<string, string> = {};
                Object.entries(regMap).forEach(([devId, regs]) => regs.forEach(r => { regToDev[r.id] = devId; }));

                if (automationId) {
                    const detail = await fetchDetail(automationId);
                    if (cancelled) return;
                    const devMap = Object.fromEntries(devs.map(d => [d.id, d])) as Record<string, Device>;
                    applyDetail(detail, regToDev, devMap);
                    setView('wizard');
                } else {
                    setView('entry');
                }
            } catch (err: any) {
                if (!cancelled) setLoadError(err?.message || 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [farmId, automationId]);

    // Hydrate the form from a fetched scene. `copy` = duplicate into a brand-new automation.
    const applyDetail = (detail: AutomationDetail, regToDev: Record<string, string>, devMap: Record<string, Device>, copy = false) => {
        // A copy is a brand-new scene → no creator/editor yet.
        setAudit(copy ? {} : { created_by: detail.created_by, updated_by: detail.updated_by });
        setName(copy ? `${detail.name} (copy)` : (detail.name || ''));
        setDescription(detail.description || '');
        setDisplayNamesStr(detail.display_names ? JSON.stringify(detail.display_names, null, 2) : '');
        setEvaluationMode(detail.evaluation_mode || 'edge');
        setPriority(Number(detail.priority) || (isPreset ? PRESET_PRIORITY_FLOOR : 1));
        setIsEnabled(detail.is_enabled ?? true);

        const mapCondition = (c: AutomationCondition): ECondition => {
            const devId = c.register_id ? regToDev[c.register_id] : undefined;
            const dev = devId ? devMap[devId] : undefined;
            return {
                _key: newKey(),
                condition_type: c.condition_type,
                register_id: c.register_id ?? (c.condition_type === 'register_value' ? '' : null),
                params: c.params || defaultParams(c.condition_type),
                is_negated: !!c.is_negated,
                // Preset tunable metadata (only meaningful on register_value conditions).
                is_tunable: !!c.is_tunable,
                tunable_min: c.tunable_min ?? null,
                tunable_max: c.tunable_max ?? null,
                _deviceId: devId,
                _category: c.condition_type === 'register_value'
                    ? (dev?.device_kind === 'actuator' ? 'device' : 'sensor')
                    : undefined,
            };
        };
        // Sub-groups are not used; flatten any legacy nested conditions into the single group.
        const flatten = (g: AutomationConditionGroup): ECondition[] => [
            ...(g.conditions || []).map(mapCondition),
            ...(g.sub_groups || []).flatMap(flatten),
        ];

        if (detail.condition_groups && detail.condition_groups.length > 0) {
            const root = detail.condition_groups[0];
            setRootGroup({ _key: newKey(), logical_op: root.logical_op || 'AND', conditions: flatten(root) });
        } else {
            setRootGroup(makeGroup('AND'));
        }

        const mapAction = (a: AutomationAction): EAction => {
            const isRegisterMode = !a.target_device_id && !!a.target_register_id;
            return {
                _key: newKey(),
                action_type: a.action_type,
                _mode: isRegisterMode ? 'register' : 'device',
                target_device_id: a.target_device_id ?? '',
                target_register_id: a.target_register_id ?? '',
                value: a.value ?? 0,
                params: a.params || {},
                delay_seconds_before: a.delay_seconds_before ?? 0,
                _deviceId: a.target_register_id ? regToDev[a.target_register_id] : undefined,
            };
        };
        setActions((detail.actions || []).map(mapAction));
    };

    const startFromScratch = () => {
        setName(''); setDescription(''); setDisplayNamesStr('');
        setEvaluationMode('edge'); setPriority(isPreset ? PRESET_PRIORITY_FLOOR : 1); setIsEnabled(true);
        setRootGroup(makeGroup('AND')); setActions([]); setAudit({});
        setStep(1); setView('wizard');
    };

    const copyFrom = async (rule: AutomationScene) => {
        setLoading(true);
        try {
            const detail = previewCache[rule.id] || await fetchDetail(rule.id);
            applyDetail(detail, registerToDevice, deviceById, true);
            setStep(1); setView('wizard');
        } catch (err: any) {
            alert(t('auto.saveFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setLoading(false);
        }
    };

    const onRowHover = (rule: AutomationScene, e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const width = 320;
        let left = r.right + 12;
        if (left + width > window.innerWidth - 12) left = Math.max(12, r.left - width - 12);
        setHover({ id: rule.id, top: r.top, left });
        if (!previewCache[rule.id]) {
            fetchDetail(rule.id)
                .then(d => setPreviewCache(p => ({ ...p, [rule.id]: d })))
                .catch(() => { });
        }
    };

    // ── Condition / action mutators ──
    const setMatch = (op: LogicalOp) => setRootGroup(g => ({ ...g, logical_op: op }));
    const addCondition = (type: ConditionType, category?: CondCategory) => {
        setRootGroup(g => ({ ...g, conditions: [...g.conditions, makeCondition(type, category)] }));
        setShowCondPicker(false);
    };
    const updateCondition = (c: ECondition) => setRootGroup(g => ({ ...g, conditions: g.conditions.map(x => x._key === c._key ? c : x) }));
    const removeCondition = (key: string) => setRootGroup(g => ({ ...g, conditions: g.conditions.filter(x => x._key !== key) }));

    const addAction = (type: AutomationActionType) => {
        setActions(a => [...a, makeAction(type)]);
        setShowActionPicker(false);
    };
    const updateAction = (a: EAction) => setActions(prev => prev.map(x => x._key === a._key ? a : x));
    const removeAction = (key: string) => setActions(prev => prev.filter(x => x._key !== key));

    // ── Serialization ──
    const serializeGroup = (g: EGroup): AutomationConditionGroup => ({
        logical_op: g.logical_op,
        display_order: 0,
        conditions: g.conditions.map((c, i) => ({
            condition_type: c.condition_type,
            ...(c.condition_type === 'register_value' ? { register_id: c.register_id || undefined } : {}),
            params: c.params,
            is_negated: !!c.is_negated,
            display_order: i,
            // Tunable flags only apply to preset register_value conditions; min/max sent
            // only when set so the BE keeps them optional (clamped to register bounds otherwise).
            ...(isPreset && c.condition_type === 'register_value'
                ? {
                    is_tunable: !!c.is_tunable,
                    ...(c.is_tunable && c.tunable_min !== null && c.tunable_min !== undefined ? { tunable_min: Number(c.tunable_min) } : {}),
                    ...(c.is_tunable && c.tunable_max !== null && c.tunable_max !== undefined ? { tunable_max: Number(c.tunable_max) } : {}),
                }
                : {}),
        })),
        sub_groups: [],
    });

    const serializeAction = (a: EAction, i: number): AutomationAction => {
        const base = {
            action_type: a.action_type,
            delay_seconds_before: Number(a.delay_seconds_before) || 0,
            execution_order: i,
        };
        switch (a.action_type) {
            case 'set_register_value':
                return a._mode === 'device'
                    ? { ...base, target_device_id: a.target_device_id || undefined, value: Number(a.value) }
                    : { ...base, target_register_id: a.target_register_id || undefined, value: Number(a.value) };
            case 'notification':
                return { ...base, params: { channel: a.params?.channel || 'email', subject: a.params?.subject || '', body: a.params?.body || '' } };
            case 'delay':
                return { ...base, params: { seconds: Number(a.params?.seconds) || 0 } };
            case 'run_automation':
                return { ...base, params: { automation_id: a.params?.automation_id || '' } };
            default:
                return base;
        }
    };

    // ── Validation (mirror backend constraints) — returns [messages, offendingStep] ──
    const collectErrors = (): { msgs: string[]; step: Step | null } => {
        const errs: string[] = [];
        let firstStep: Step | null = null;
        const flag = (s: Step) => { if (firstStep === null) firstStep = s; };

        rootGroup.conditions.forEach(c => {
            if (c.condition_type === 'register_value' && !c.register_id) { errs.push(t('auto.vRegister')); flag(1); }
            // Preset tunable bounds: if both bounds are set, min must be ≤ max and the
            // current threshold value must fall inside the band (else members can't tune it).
            if (isPreset && c.condition_type === 'register_value' && c.is_tunable) {
                const min = c.tunable_min;
                const max = c.tunable_max;
                const hasMin = min !== null && min !== undefined && (min as any) !== '';
                const hasMax = max !== null && max !== undefined && (max as any) !== '';
                if (hasMin && hasMax && Number(min) > Number(max)) { errs.push(t('preset.vTunableRange')); flag(1); }
                const val = Number(c.params?.value);
                if (!Number.isNaN(val)) {
                    if ((hasMin && val < Number(min)) || (hasMax && val > Number(max))) { errs.push(t('preset.vTunableValue')); flag(1); }
                }
            }
        });

        actions.forEach(a => {
            if (a.action_type === 'set_register_value') {
                if (a._mode === 'device') {
                    if (!a.target_device_id || a.value === null || a.value === undefined || (a.value as any) === '') {
                        errs.push(t('auto.vActionDevice')); flag(2);
                    } else {
                        const dev = devices.find(d => d.id === a.target_device_id);
                        if (dev?.device_type === 'switch' && Number(a.value) !== 0 && Number(a.value) !== 1) { errs.push(t('auto.vSwitchValue')); flag(2); }
                    }
                } else if (!a.target_register_id || a.value === null || a.value === undefined || (a.value as any) === '') {
                    errs.push(t('auto.vActionRegister')); flag(2);
                }
            } else if (a.action_type === 'notification' && !a.params?.channel) { errs.push(t('auto.vNotification')); flag(2); }
            else if (a.action_type === 'delay' && !(Number(a.params?.seconds) > 0)) { errs.push(t('auto.vDelay')); flag(2); }
            else if (a.action_type === 'run_automation' && !a.params?.automation_id) { errs.push(t('auto.vRunAutomation')); flag(2); }
        });

        if (!name.trim()) { errs.push(t('auto.vName')); flag(3); }
        return { msgs: Array.from(new Set(errs)), step: firstStep };
    };

    const handleSave = async () => {
        const { msgs, step: badStep } = collectErrors();
        if (msgs.length > 0) {
            if (badStep) setStep(badStep);
            alert(msgs.join('\n'));
            return;
        }

        let display_names: Record<string, string> | undefined;
        const dnStr = displayNamesStr.trim();
        if (dnStr) {
            try {
                const parsed = JSON.parse(dnStr);
                display_names = parsed && Object.keys(parsed).length ? parsed : undefined;
            } catch {
                setStep(3);
                alert(t('detail.invalidJson'));
                return;
            }
        }

        const body = {
            name: name.trim(),
            description: description.trim() || undefined,
            display_names,
            evaluation_mode: evaluationMode,
            priority: Number(priority) || 0,
            is_enabled: isEnabled,
            condition_groups: [serializeGroup(rootGroup)],
            actions: actions.map(serializeAction),
        };

        setSaving(true);
        try {
            if (isPreset) {
                // Preset body omits farm_id (path) + is_preset (server). priority is clamped server-side.
                if (isEdit && automationId) {
                    await presetsApi.fullUpdate(automationId, body);
                    alert(t('preset.updateSuccess'));
                } else {
                    await presetsApi.create(farmId, body);
                    alert(t('preset.createSuccess'));
                }
            } else if (isEdit && automationId) {
                await automationsApi.fullUpdate(automationId, body);
                alert(t('auto.updateSuccess'));
            } else {
                await automationsApi.create({ farm_id: farmId, ...body } as AutomationCreatePayload);
                alert(t('auto.createSuccess'));
            }
            onSaved();
        } catch (err: any) {
            alert(t('auto.saveFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    // ── Summaries ──
    const summarizeCondition = (c: AutomationCondition): string => {
        const neg = c.is_negated ? 'NOT ' : '';
        const p = c.params || {};
        switch (c.condition_type) {
            case 'time_of_day': return `${neg}@ ${p.time ?? '--:--'}`;
            case 'time_range': return `${neg}${p.start ?? '--:--'}–${p.end ?? '--:--'}`;
            case 'day_of_week': return `${neg}${(p.days || []).map((d: string) => d.toUpperCase()).join(', ') || '—'}`;
            case 'sun_event': return `${neg}${p.event ?? 'sunrise'} ${(p.offset_minutes ?? 0) >= 0 ? '+' : ''}${p.offset_minutes ?? 0}m`;
            case 'register_value': {
                const devId = c.register_id ? registerToDevice[c.register_id] : undefined;
                const label = (devId && deviceById[devId]?.name) || (c.register_id && registerById[c.register_id]?.code) || t('auto.cat.sensor');
                return `${neg}${label} ${p.operator ?? '>'} ${p.value ?? '?'}`;
            }
            default: return c.condition_type;
        }
    };

    const summarizeAction = (a: AutomationAction): string => {
        switch (a.action_type) {
            case 'set_register_value': {
                let target = '?';
                if (a.target_device_id) target = deviceById[a.target_device_id]?.name || t('auto.a.device');
                else if (a.target_register_id) target = registerById[a.target_register_id]?.code || t('auto.a.register');
                return `${t('auto.sum.set', { target })} = ${a.value ?? '?'}`;
            }
            case 'notification': return `${t('auto.acat.notification')} (${a.params?.channel || 'email'})`;
            case 'delay': return `${t('auto.acat.delay')} ${a.params?.seconds ?? 0}s`;
            case 'run_automation': {
                const r = automations.find(x => x.id === a.params?.automation_id);
                return `${t('auto.acat.run_automation')}: ${r?.name || '—'}`;
            }
            default: return a.action_type;
        }
    };

    const flattenRaw = (g: AutomationConditionGroup): AutomationCondition[] => [
        ...(g.conditions || []),
        ...(g.sub_groups || []).flatMap(flattenRaw),
    ];

    // ── Render ──
    const creatorUser = audit.created_by ? users[audit.created_by] : undefined;
    const editorUser = audit.updated_by ? users[audit.updated_by] : undefined;
    const roleLabelOf = (u: UserResponse) => (u.global_role === 'super_admin' ? t('auto.roleAdmin') : t('auto.roleUser'));
    const roleClassOf = (u: UserResponse) => (u.global_role === 'super_admin' ? 'admin' : 'user');
    const headerTitle = isPreset
        ? (isEdit ? t('preset.editTitle') : t('preset.createTitle'))
        : (isEdit ? t('auto.editRuleTitle') : t('auto.createRuleTitle'));

    // Portal to <body> so the fixed overlay's containing block is always the viewport,
    // never an ancestor's scroll/overflow/transform context (which caused the modal to
    // jitter between two positions when rendered inside the scrollable Presets tab).
    return createPortal(
        <div className="ae-overlay" onClick={onClose}>
            <div className="ae-modal panel" onClick={(e) => e.stopPropagation()}>
                <div className="ae-header">
                    <h3><Wand2 size={18} className="ae-wand" /> {headerTitle}</h3>
                    <button type="button" className="ae-close" onClick={onClose}><X size={18} /></button>
                </div>

                {loading ? (
                    <div className="ae-loading"><Loader2 className="spinner" size={26} /><span>{t('auto.loadingEditor')}</span></div>
                ) : loadError ? (
                    <div className="ae-loading ae-load-error"><AlertTriangle size={26} /><span>{loadError}</span></div>
                ) : view === 'entry' ? (
                    // ── Entry: start fresh or copy ──
                    <>
                        <div className="ae-body">
                            <p className="ae-section-hint">{t('auto.entry.subtitle')}</p>
                            <button type="button" className="ae-scratch" onClick={startFromScratch}>
                                <span className="ae-scratch-icon"><Plus size={22} /></span>
                                <span className="ae-scratch-text">
                                    <strong>{t('auto.entry.scratchTitle')}</strong>
                                    <span>{t('auto.entry.scratchDesc')}</span>
                                </span>
                            </button>

                            {automations.length > 0 && (
                                <>
                                    <div className="ae-divider"><span>{t('auto.entry.copyDivider')}</span></div>
                                    <div className="ae-copy-list">
                                        {automations.map(rule => (
                                            <div
                                                key={rule.id}
                                                className="ae-copy-row"
                                                onMouseEnter={(e) => onRowHover(rule, e)}
                                                onMouseLeave={() => setHover(null)}
                                            >
                                                <span className="ae-copy-icon"><Fan size={16} /></span>
                                                <span className="ae-copy-name">{rule.name}</span>
                                                <button type="button" className="ae-copy-btn" onClick={() => copyFrom(rule)}>
                                                    <Copy size={14} /> {t('auto.entry.copy')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="ae-footer">
                            <button type="button" className="ae-cancel" onClick={onClose}>{t('btn.cancel')}</button>
                        </div>

                        {hover && (
                            <div className="ae-preview" style={{ top: hover.top, left: hover.left }}>
                                <div className="ae-preview-title"><Fan size={14} /> {automations.find(a => a.id === hover.id)?.name}</div>
                                {previewCache[hover.id] ? (() => {
                                    const d = previewCache[hover.id];
                                    const root = d.condition_groups?.[0];
                                    const conds = root ? flattenRaw(root).map(summarizeCondition) : [];
                                    const acts = (d.actions || []).map(summarizeAction);
                                    return <SummaryView logicalOp={root?.logical_op || 'AND'} conditions={conds} actions={acts} />;
                                })() : (
                                    <div className="ae-preview-loading"><Loader2 className="spinner" size={16} /></div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    // ── Wizard ──
                    <>
                        <div className="ae-steps">
                            {([1, 2, 3] as Step[]).map((n, i) => (
                                <Fragment key={n}>
                                    <button
                                        type="button"
                                        className={`ae-step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`}
                                        onClick={() => setStep(n)}
                                    >
                                        <span className="ae-step-num">{n}</span>
                                        <span className="ae-step-label">{t(n === 1 ? 'auto.step.conditions' : n === 2 ? 'auto.step.actions' : 'auto.step.settings')}</span>
                                    </button>
                                    {i < 2 && <span className="ae-step-line" />}
                                </Fragment>
                            ))}
                        </div>

                        <div className="ae-body">
                            {step === 1 && (
                                <>
                                    <p className="ae-section-hint">{t('auto.step1.subtitle')}</p>
                                    <div className="ae-match">
                                        <span className="ae-match-label">{t('auto.match.label')}</span>
                                        <div className="ae-logic-toggle">
                                            <button type="button" className={rootGroup.logical_op === 'AND' ? 'active' : ''} onClick={() => setMatch('AND')}>{t('auto.match.all')}</button>
                                            <button type="button" className={rootGroup.logical_op === 'OR' ? 'active' : ''} onClick={() => setMatch('OR')}>{t('auto.match.any')}</button>
                                        </div>
                                    </div>

                                    {rootGroup.conditions.length === 0 ? (
                                        <div className="ae-empty-box">{t('auto.c.noneYet')}</div>
                                    ) : (
                                        <div className="ae-card-list">
                                            {rootGroup.conditions.map(c => (
                                                <ConditionEditor
                                                    key={c._key}
                                                    condition={c}
                                                    devices={devices}
                                                    registersByDevice={registersByDevice}
                                                    isPreset={isPreset}
                                                    onChange={updateCondition}
                                                    onRemove={() => removeCondition(c._key)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    <button type="button" className={`ae-add-toggle ${showCondPicker ? 'open' : ''}`} onClick={() => setShowCondPicker(v => !v)}>
                                        <Plus size={16} /> {t('auto.c.add')}
                                    </button>

                                    {showCondPicker && (
                                        <div className="ae-picker">
                                            {(['time', 'sensor', 'device'] as const).map(groupKey => {
                                                const items = COND_CATALOGUE.filter(x => x.group === groupKey);
                                                return (
                                                    <div className="ae-picker-group" key={groupKey}>
                                                        <span className="ae-picker-hdr">{t(`auto.cat.${groupKey}Hdr`)}</span>
                                                        <div className="ae-picker-items">
                                                            {items.map(item => (
                                                                <button type="button" key={item.key} className="ae-picker-item" onClick={() => addCondition(item.type, item.category)}>
                                                                    <item.icon size={16} /> {t(condCatLabelKey(item.type, item.category))}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}

                            {step === 2 && (
                                <>
                                    <p className="ae-section-hint">{t('auto.step2.subtitle')}</p>
                                    {actions.length === 0 ? (
                                        <div className="ae-empty-box">{t('auto.a.noneYet')}</div>
                                    ) : (
                                        <div className="ae-card-list">
                                            {actions.map((a, idx) => (
                                                <ActionEditor
                                                    key={a._key}
                                                    action={a}
                                                    index={idx}
                                                    devices={devices}
                                                    registersByDevice={registersByDevice}
                                                    automations={automations.filter(r => r.id !== automationId)}
                                                    onChange={updateAction}
                                                    onRemove={() => removeAction(a._key)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    <button type="button" className={`ae-add-toggle ${showActionPicker ? 'open' : ''}`} onClick={() => setShowActionPicker(v => !v)}>
                                        <Plus size={16} /> {t('auto.a.addAction')}
                                    </button>

                                    {showActionPicker && (
                                        <div className="ae-picker">
                                            <div className="ae-picker-items wide">
                                                {ACTION_CATALOGUE.map(item => (
                                                    <button type="button" key={item.type} className="ae-picker-item" onClick={() => addAction(item.type)}>
                                                        <item.icon size={16} /> {t(`auto.acat.${item.type}`)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {step === 3 && (
                                <>
                                    <p className="ae-section-hint">{t('auto.step3.subtitle')}</p>
                                    {isEdit && (creatorUser || editorUser) && (
                                        <div className="ae-audit">
                                            {creatorUser && (
                                                <span className="ae-audit-item">
                                                    {t('auto.createdByLabel')} <strong>{creatorUser.username}</strong>
                                                    <span className={`role-badge ${roleClassOf(creatorUser)}`}>{roleLabelOf(creatorUser)}</span>
                                                </span>
                                            )}
                                            {editorUser && (
                                                <span className="ae-audit-item">
                                                    {t('auto.updatedByLabel')} <strong>{editorUser.username}</strong>
                                                    <span className={`role-badge ${roleClassOf(editorUser)}`}>{roleLabelOf(editorUser)}</span>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="ae-field">
                                        <label>{t('auto.f.name')} *</label>
                                        <input type="text" value={name} placeholder={t('auto.f.namePh')} onChange={e => setName(e.target.value)} />
                                    </div>
                                    <div className="ae-field">
                                        <label>{t('auto.f.description')}</label>
                                        <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
                                    </div>
                                    <div className="ae-grid-2">
                                        <div className="ae-field">
                                            <label>{t('auto.f.triggerMode')}</label>
                                            <select value={evaluationMode} onChange={e => setEvaluationMode(e.target.value as EvaluationMode)}>
                                                <option value="edge">{t('auto.f.modeEdge')}</option>
                                                <option value="interval">{t('auto.f.modeInterval')}</option>
                                            </select>
                                        </div>
                                        <div className="ae-field">
                                            <label>{t('auto.f.priority')}</label>
                                            <input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value, 10) || 0)} />
                                            {isPreset && <span className="ae-hint">{t('preset.priorityHint', { floor: PRESET_PRIORITY_FLOOR })}</span>}
                                        </div>
                                    </div>
                                    <div className="ae-field">
                                        <label>{t('detail.displayNamesJson')}</label>
                                        <textarea
                                            className="ae-json" rows={3} spellCheck={false}
                                            placeholder={'{\n  "en": "Cool greenhouse",\n  "ko": "온실 냉방"\n}'}
                                            value={displayNamesStr}
                                            onChange={e => setDisplayNamesStr(e.target.value)}
                                        />
                                        <span className="ae-hint">{t('auto.f.displayNamesHint')}</span>
                                    </div>
                                    <label className="ae-check">
                                        <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} />
                                        {t('auto.f.enableNow')}
                                    </label>

                                    <div className="ae-summary">
                                        <div className="ae-summary-title">{t('auto.sum.title')}</div>
                                        <SummaryView
                                            logicalOp={rootGroup.logical_op}
                                            conditions={rootGroup.conditions.map(summarizeCondition)}
                                            actions={actions.map(summarizeAction)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="ae-footer">
                            {step > 1
                                ? <button type="button" className="ae-cancel" onClick={() => setStep((step - 1) as Step)}><ArrowLeft size={15} /> {t('auto.btn.back')}</button>
                                : <span />}
                            <div className="ae-footer-right">
                                <button type="button" className="ae-cancel" onClick={onClose}>{t('btn.cancel')}</button>
                                {step < 3 ? (
                                    <button type="button" className="primary" onClick={() => setStep((step + 1) as Step)}>{t('auto.btn.continue')} <ArrowRight size={15} /></button>
                                ) : (
                                    <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                                        {saving ? <Loader2 className="spinner" size={14} /> : <Save size={15} />} {saving ? t('auto.saving') : t('auto.btn.save')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

// ── Read-only IF/THEN summary (shared by step 3 + copy preview) ──
function SummaryView({ logicalOp, conditions, actions }: { logicalOp: LogicalOp; conditions: string[]; actions: string[] }) {
    const { t } = useTranslation();
    return (
        <>
            <div className="ae-sum-block">
                <span className="ae-sum-badge if">{t('auto.sum.if', { mode: logicalOp === 'AND' ? t('auto.sum.all') : t('auto.sum.any') })}</span>
                {conditions.length ? conditions.map((s, i) => (
                    <div className="ae-sum-row" key={i}><ChevronRight size={13} /><span>{s}</span></div>
                )) : <div className="ae-sum-row muted">{t('auto.sum.always')}</div>}
            </div>
            <div className="ae-sum-block">
                <span className="ae-sum-badge then">{t('auto.sum.then')}</span>
                {actions.length ? actions.map((s, i) => (
                    <div className="ae-sum-row" key={i}><ChevronRight size={13} /><span>{s}</span></div>
                )) : <div className="ae-sum-row muted">{t('auto.sum.noActions')}</div>}
            </div>
        </>
    );
}

// ── Single condition card ──
interface ConditionEditorProps {
    condition: ECondition;
    devices: Device[];
    registersByDevice: Record<string, Register[]>;
    isPreset?: boolean; // preset mode → show "tunable threshold" controls
    onChange: (c: ECondition) => void;
    onRemove: () => void;
}

function ConditionEditor({ condition, devices, registersByDevice, isPreset, onChange, onRemove }: ConditionEditorProps) {
    const { t } = useTranslation();
    const c = condition;
    const setParam = (key: string, value: any) => onChange({ ...c, params: { ...c.params, [key]: value } });

    const toggleDay = (day: string) => {
        const days: string[] = Array.isArray(c.params.days) ? c.params.days : [];
        setParam('days', days.includes(day) ? days.filter(d => d !== day) : [...days, day]);
    };

    // Filter device list by the picked category (sensor vs actuator); fall back to all if empty.
    const filtered = c._category === 'sensor'
        ? devices.filter(d => d.device_kind === 'sensor')
        : c._category === 'device'
            ? devices.filter(d => d.device_kind === 'actuator')
            : devices;
    const condDevices = filtered.length ? filtered : devices;
    const deviceRegisters = c._deviceId ? (registersByDevice[c._deviceId] || []) : [];
    const selectedReg = c.register_id ? deviceRegisters.find(r => r.id === c.register_id) : undefined;

    return (
        <div className="ae-cond">
            <div className="ae-cond-top">
                <span className="ae-cond-label">{t(condCatLabelKey(c.condition_type, c._category))}</span>
                <label className="ae-negate" title={t('auto.c.negateHint')}>
                    <input type="checkbox" checked={!!c.is_negated} onChange={e => onChange({ ...c, is_negated: e.target.checked })} />
                    {t('auto.c.negate')}
                </label>
                <button type="button" className="ae-btn-remove" onClick={onRemove} title={t('btn.delete')}><Trash2 size={14} /></button>
            </div>

            <div className="ae-cond-params">
                {c.condition_type === 'register_value' && (
                    <>
                        <div className="ae-pfield">
                            <label>{t('auto.c.device')}</label>
                            <select value={c._deviceId || ''} onChange={e => onChange({ ...c, _deviceId: e.target.value, register_id: '' })}>
                                <option value="">{t('auto.a.selectDevice')}</option>
                                {condDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div className="ae-pfield">
                            <label>{t('auto.c.register')}</label>
                            <select value={c.register_id || ''} disabled={!c._deviceId} onChange={e => onChange({ ...c, register_id: e.target.value })}>
                                <option value="">{t('auto.a.selectRegister')}</option>
                                {deviceRegisters.map(r => <option key={r.id} value={r.id}>{r.code} ({r.role})</option>)}
                            </select>
                        </div>
                        <div className="ae-pfield short">
                            <label>{t('auto.c.operator')}</label>
                            <select value={c.params.operator || '>'} onChange={e => setParam('operator', e.target.value)}>
                                {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                        </div>
                        <div className="ae-pfield short">
                            <label>{t('auto.c.value')}</label>
                            <input type="number" step="any" value={c.params.value ?? 0} onChange={e => setParam('value', e.target.value === '' ? '' : Number(e.target.value))} />
                        </div>

                        {isPreset && (
                            <div className="ae-pfield full ae-tunable">
                                <label className="ae-tunable-toggle">
                                    <input type="checkbox" checked={!!c.is_tunable} onChange={e => onChange({ ...c, is_tunable: e.target.checked })} />
                                    <Sliders size={13} />
                                    <span>{t('preset.tunableLabel')}</span>
                                </label>
                                <span className="ae-hint">{t('preset.tunableHint')}</span>
                                {c.is_tunable && (
                                    <div className="ae-tunable-bounds">
                                        <div className="ae-pfield short">
                                            <label>{t('preset.tunableMin')}</label>
                                            <input
                                                type="number" step="any"
                                                placeholder={selectedReg ? String(selectedReg.min_value) : ''}
                                                value={c.tunable_min ?? ''}
                                                onChange={e => onChange({ ...c, tunable_min: e.target.value === '' ? null : Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="ae-pfield short">
                                            <label>{t('preset.tunableMax')}</label>
                                            <input
                                                type="number" step="any"
                                                placeholder={selectedReg ? String(selectedReg.max_value) : ''}
                                                value={c.tunable_max ?? ''}
                                                onChange={e => onChange({ ...c, tunable_max: e.target.value === '' ? null : Number(e.target.value) })}
                                            />
                                        </div>
                                        {selectedReg && (
                                            <span className="ae-hint ae-tunable-reg">
                                                {t('preset.registerBounds', { min: selectedReg.min_value, max: selectedReg.max_value, unit: selectedReg.unit || '' })}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {c.condition_type === 'time_range' && (
                    <>
                        <div className="ae-pfield short"><label>{t('auto.c.start')}</label><input type="time" value={c.params.start || '08:00'} onChange={e => setParam('start', e.target.value)} /></div>
                        <div className="ae-pfield short"><label>{t('auto.c.end')}</label><input type="time" value={c.params.end || '18:00'} onChange={e => setParam('end', e.target.value)} /></div>
                    </>
                )}

                {c.condition_type === 'time_of_day' && (
                    <div className="ae-pfield short"><label>{t('auto.c.time')}</label><input type="time" value={c.params.time || '06:00'} onChange={e => setParam('time', e.target.value)} /></div>
                )}

                {c.condition_type === 'sun_event' && (
                    <>
                        <div className="ae-pfield">
                            <label>{t('auto.c.event')}</label>
                            <select value={c.params.event || 'sunrise'} onChange={e => setParam('event', e.target.value)}>
                                <option value="sunrise">{t('auto.c.sunrise')}</option>
                                <option value="sunset">{t('auto.c.sunset')}</option>
                            </select>
                        </div>
                        <div className="ae-pfield short"><label>{t('auto.c.offset')}</label><input type="number" value={c.params.offset_minutes ?? 0} onChange={e => setParam('offset_minutes', parseInt(e.target.value, 10) || 0)} /></div>
                    </>
                )}

                {c.condition_type === 'day_of_week' && (
                    <div className="ae-pfield full">
                        <label>{t('auto.c.days')}</label>
                        <div className="ae-days">
                            {DAYS.map(day => {
                                const active = Array.isArray(c.params.days) && c.params.days.includes(day);
                                return <button type="button" key={day} className={`ae-day ${active ? 'active' : ''}`} onClick={() => toggleDay(day)}>{day.toUpperCase()}</button>;
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Single action card ──
interface ActionEditorProps {
    action: EAction;
    index: number;
    devices: Device[];
    registersByDevice: Record<string, Register[]>;
    automations: AutomationScene[];
    onChange: (a: EAction) => void;
    onRemove: () => void;
}

function ActionEditor({ action, index, devices, registersByDevice, automations, onChange, onRemove }: ActionEditorProps) {
    const { t } = useTranslation();
    const a = action;
    const setParam = (key: string, value: any) => onChange({ ...a, params: { ...a.params, [key]: value } });

    const actuators = devices.filter(d => d.device_type === 'switch' || d.device_type === 'open_close');
    const selectedDevice = devices.find(d => d.id === a.target_device_id);
    const writableRegisters = a._deviceId ? (registersByDevice[a._deviceId] || []).filter(r => r.writable) : [];

    return (
        <div className="ae-action">
            <div className="ae-action-top">
                <span className="ae-action-order">{index + 1}</span>
                <span className="ae-action-label">{t(`auto.acat.${a.action_type}`)}</span>
                <button type="button" className="ae-btn-remove" onClick={onRemove} title={t('btn.delete')}><Trash2 size={14} /></button>
            </div>

            <div className="ae-action-params">
                {a.action_type === 'set_register_value' && (
                    <>
                        <div className="ae-mode-toggle">
                            <button type="button" className={a._mode === 'device' ? 'active' : ''} onClick={() => onChange({ ...a, _mode: 'device', target_register_id: '', _deviceId: undefined })}>{t('auto.a.modeDevice')}</button>
                            <button type="button" className={a._mode === 'register' ? 'active' : ''} onClick={() => onChange({ ...a, _mode: 'register', target_device_id: '' })}>{t('auto.a.modeRegister')}</button>
                        </div>

                        {a._mode === 'device' ? (
                            <div className="ae-action-row">
                                <div className="ae-pfield">
                                    <label>{t('auto.a.device')}</label>
                                    <select value={a.target_device_id || ''} onChange={e => onChange({ ...a, target_device_id: e.target.value, value: 0 })}>
                                        <option value="">{t('auto.a.selectDevice')}</option>
                                        {actuators.map(d => <option key={d.id} value={d.id}>{d.name} · {d.device_type}</option>)}
                                    </select>
                                </div>
                                <div className="ae-pfield short">
                                    <label>{t('auto.a.value')}</label>
                                    {selectedDevice?.device_type === 'switch' ? (
                                        <div className="ae-onoff">
                                            <button type="button" className={Number(a.value) === 1 ? 'active' : ''} onClick={() => onChange({ ...a, value: 1 })}>{t('auto.a.on')}</button>
                                            <button type="button" className={Number(a.value) === 0 ? 'active' : ''} onClick={() => onChange({ ...a, value: 0 })}>{t('auto.a.off')}</button>
                                        </div>
                                    ) : (
                                        <input type="number" min={0} max={selectedDevice?.device_type === 'open_close' ? 100 : undefined} value={a.value ?? 0} onChange={e => onChange({ ...a, value: e.target.value === '' ? 0 : Number(e.target.value) })} />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="ae-action-row">
                                <div className="ae-pfield">
                                    <label>{t('auto.a.device')}</label>
                                    <select value={a._deviceId || ''} onChange={e => onChange({ ...a, _deviceId: e.target.value, target_register_id: '' })}>
                                        <option value="">{t('auto.a.selectDevice')}</option>
                                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div className="ae-pfield">
                                    <label>{t('auto.a.register')}</label>
                                    <select value={a.target_register_id || ''} disabled={!a._deviceId} onChange={e => onChange({ ...a, target_register_id: e.target.value })}>
                                        <option value="">{t('auto.a.selectRegister')}</option>
                                        {writableRegisters.map(r => <option key={r.id} value={r.id}>{r.code} ({r.role})</option>)}
                                    </select>
                                </div>
                                <div className="ae-pfield short">
                                    <label>{t('auto.a.value')}</label>
                                    <input type="number" step="any" value={a.value ?? 0} onChange={e => onChange({ ...a, value: e.target.value === '' ? 0 : Number(e.target.value) })} />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {a.action_type === 'notification' && (
                    <div className="ae-action-col">
                        <div className="ae-action-row">
                            <div className="ae-pfield"><label>{t('auto.a.channel')}</label><input type="text" value={a.params?.channel || 'email'} onChange={e => setParam('channel', e.target.value)} /></div>
                            <div className="ae-pfield"><label>{t('auto.a.subject')}</label><input type="text" value={a.params?.subject || ''} onChange={e => setParam('subject', e.target.value)} /></div>
                        </div>
                        <div className="ae-pfield full"><label>{t('auto.a.body')}</label><textarea rows={2} value={a.params?.body || ''} onChange={e => setParam('body', e.target.value)} /></div>
                    </div>
                )}

                {a.action_type === 'delay' && (
                    <div className="ae-pfield short"><label>{t('auto.a.seconds')}</label><input type="number" min={0} value={a.params?.seconds ?? 0} onChange={e => setParam('seconds', parseInt(e.target.value, 10) || 0)} /></div>
                )}

                {a.action_type === 'run_automation' && (
                    <div className="ae-pfield">
                        <label>{t('auto.a.targetAutomation')}</label>
                        <select value={a.params?.automation_id || ''} onChange={e => setParam('automation_id', e.target.value)}>
                            <option value="">{t('auto.a.selectAutomation')}</option>
                            {automations.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                )}

                {a.action_type !== 'delay' && (
                    <div className="ae-pfield short">
                        <label>{t('auto.a.delayBefore')}</label>
                        <input type="number" min={0} value={a.delay_seconds_before ?? 0} onChange={e => onChange({ ...a, delay_seconds_before: parseInt(e.target.value, 10) || 0 })} />
                    </div>
                )}
            </div>
        </div>
    );
}
