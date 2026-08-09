import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    X, Plus, Trash2, Loader2, AlertTriangle, Wand2, Fan, Copy, ChevronRight,
    Clock, Hourglass, CalendarDays, Sunrise, Gauge, Plug, Bell, Timer, Workflow,
    ArrowLeft, ArrowRight, Save, Sliders, Sigma, Info, RefreshCw,
} from 'lucide-react';
import { automationsApi, presetsApi, devicesApi, registersApi, usersApi, virtualSensorsApi, sensorsApi, zonesApi } from '../../../api/services';
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
    Zone,
    VirtualSensor,
    VirtualSensorAgg,
    SlaveSensorReading,
    PresetPackageRule,
} from '../../../types';
import { displayNamesToText, emptyDisplayNamesText, parseDisplayNamesText, localizedName } from '../../../utils/displayNames';
import { buildDeviceLabels, byLabel } from '../../../utils/deviceLabel';
import './AutomationEditorModal.css';

// ── Editor-local types: shared model + stable React key + ephemeral picker state ──
let _keySeq = 0;
const newKey = () => `ae${++_keySeq}`;

// 'sensor'  → one register of one sensor device (optionally turned into a brand-new
//             aggregate by the "Aggregate" modifier)
// 'device'  → one register of an actuator
// 'vsensor' → an EXISTING virtual sensor of the farm, picked by name. The payload is
//             the same `virtual_sensor_id` the modifier produces; the difference is
//             that nothing is created or mutated, the definition stays the Virtual
//             sensors tab's business.
type CondCategory = 'sensor' | 'device' | 'vsensor';

interface ECondition extends AutomationCondition {
    _key: string;
    _deviceId?: string; // device that owns register_id (cascade helper, not serialized)
    _category?: CondCategory; // drives device-list filtering for register_value
    // ── "Aggregate" modifier (Sensor reading cards only) ──
    // Off by default: the card, the payload and the runtime behaviour are then
    // exactly the single-register ones. On, the condition is backed by a virtual
    // sensor (MIN/AVG/MAX) resolved at save time — register_id stays the first member.
    _aggOn?: boolean;
    _agg?: VirtualSensorAgg;
    _extraRegisterIds?: string[]; // members after the primary (register_id)
    // Set when hydrating a condition that already points at a virtual sensor.
    // _vsOpaque = the referenced sensor could not be read, so its definition is
    // passed through untouched instead of being rebuilt from an unknown member list.
    _vsCode?: string;
    _vsOpaque?: boolean;
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
    { key: 'vsensor', type: 'register_value', category: 'vsensor', icon: Sigma, group: 'sensor' },
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
    // A virtual-sensor condition carries virtual_sensor_id instead of register_id.
    register_id: type === 'register_value' && category !== 'vsensor' ? '' : null,
    ...(category === 'vsensor' ? { virtual_sensor_id: '' } : {}),
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
    type === 'register_value'
        ? (category === 'device' ? 'auto.cat.device' : category === 'vsensor' ? 'auto.cat.vsensor' : 'auto.cat.sensor')
        : `auto.cat.${type}`;

type Step = 1 | 2 | 3;

// Anything complete enough to hydrate the form: a fetched AutomationDetail, or an
// in-memory package-rule payload that has never been saved.
interface HydrationSource {
    name?: string;
    description?: string | null;
    display_names?: Record<string, string> | null;
    evaluation_mode?: EvaluationMode;
    priority?: number | string;
    is_enabled?: boolean;
    created_by?: string | null;
    updated_by?: string | null;
    condition_groups?: AutomationConditionGroup[];
    actions?: AutomationAction[];
}

// ── Aggregate ("virtual sensor") helpers ─────────────────────────────────
const AGGS: VirtualSensorAgg[] = ['min', 'avg', 'max'];

// Members of an aggregate condition: the primary register picked in the card, then the extras.
const memberIdsOf = (c: ECondition): string[] =>
    [c.register_id || '', ...(c._extraRegisterIds || [])].filter(Boolean) as string[];

const aggregateOf = (agg: VirtualSensorAgg, values: number[]): number | null => {
    if (!values.length) return null;
    if (agg === 'min') return Math.min(...values);
    if (agg === 'max') return Math.max(...values);
    return values.reduce((a, b) => a + b, 0) / values.length;
};

// Which member currently sets a MIN/MAX. AVG has no single decider → null.
const decidingIndexOf = (agg: VirtualSensorAgg, values: Array<number | null>): number | null => {
    if (agg === 'avg') return null;
    let best: number | null = null;
    values.forEach((v, i) => {
        if (v === null || Number.isNaN(v)) return;
        if (best === null) { best = i; return; }
        const cur = values[best] as number;
        if (agg === 'min' ? v < cur : v > cur) best = i;
    });
    return best;
};

const compare = (op: string, left: number, right: number): boolean | null => {
    switch (op) {
        case '>': return left > right;
        case '>=': return left >= right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '==': return left === right;
        case '!=': return left !== right;
        default: return null;
    }
};

// Trim to 4 significant decimals without dragging trailing zeros around.
const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10000) / 10000));

const sameMembers = (a: string[], b: string[]): boolean =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// Virtual sensor codes are identifiers on the wire: ^[a-z][a-z0-9_]*$, ≤100 chars,
// and they share the farm's namespace with device codes.
const slugifyCode = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

const makeVsCode = (agg: VirtualSensorAgg, primaryCode: string, taken: Set<string>): string => {
    const base = `vs_${agg}_${slugifyCode(primaryCode) || 'sensor'}`.slice(0, 96);
    let code = base;
    let n = 2;
    while (taken.has(code)) code = `${base}_${n++}`.slice(0, 100);
    return code;
};

const makeVsName = (agg: VirtualSensorAgg, primaryName: string, count: number): string => {
    const head = `${agg.toUpperCase()} of ${count} sensor${count === 1 ? '' : 's'}`;
    return primaryName ? `${head} — ${primaryName}` : head;
};

// Unit two registers must share to be aggregated together (case/space-insensitive).
const unitKeyOf = (r?: Register | null): string => (r?.unit || '').trim().toLowerCase();

// Preset priority band floor (mirrors backend preset_priority_floor default).
// Presets always sort above user automations; the value is clamped server-side anyway.
const PRESET_PRIORITY_FLOOR = 10000;

// Rule-builder mode: the modal builds a rule and hands the payload back instead of
// persisting it itself. Used to author the rules of a preset package, which are
// POSTed as one batch (or appended one at a time) by the caller — same form builder.
// One entry of the "copy from an existing rule" list on the entry screen.
// Either already in memory (`rule` — a draft of a package that is not saved yet) or
// fetched on demand by id (`id` — a saved preset / automation).
export interface CopyCandidate {
    key: string;                // stable list key
    name: string;               // label to show (already localized by the caller)
    id?: string;
    rule?: PresetPackageRule;
    group?: string;             // optional section header, e.g. "In this package"
}

export interface RuleBuilderConfig {
    initial?: PresetPackageRule | null; // hydrate for "edit this rule of the package"
    onSubmit: (rule: PresetPackageRule) => Promise<void> | void;
    title?: string;
    submitLabel?: string;
    // Offered on the entry screen when adding a NEW rule. Empty/omitted → straight to
    // the wizard, since there would be nothing to choose from.
    copySources?: CopyCandidate[];
}

interface AutomationEditorModalProps {
    farmId: string;
    automationId: string | null; // null = create
    automations: AutomationScene[]; // for copy-from list + run_automation target
    mode?: 'automation' | 'preset'; // 'preset' → expert-authored preset CRUD
    builder?: RuleBuilderConfig; // set → don't save, return the payload
    nested?: boolean; // stack above another modal (preset package editor)
    onClose: () => void;
    onSaved: () => void;
}

export default function AutomationEditorModal({ farmId, automationId, automations, mode = 'automation', builder, nested, onClose, onSaved }: AutomationEditorModalProps) {
    const { t, i18n } = useTranslation();
    const isBuilder = !!builder;
    const isEdit = isBuilder ? !!builder?.initial : !!automationId;
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
    // Zones only feed the device labels: a farm repeats device names per sensor group,
    // so "Temperature Sensor" alone is ambiguous in every picker.
    const [zones, setZones] = useState<Zone[]>([]);
    const [registersByDevice, setRegistersByDevice] = useState<Record<string, Register[]>>({});
    const [users, setUsers] = useState<Record<string, UserResponse>>({});
    // Virtual sensors of the farm — the store behind the Aggregate modifier.
    const [virtualSensors, setVirtualSensors] = useState<VirtualSensor[]>([]);
    const [vsUnavailable, setVsUnavailable] = useState(false);
    // Live readings keyed by device code, for the aggregate preview helper.
    const [live, setLive] = useState<Record<string, SlaveSensorReading>>({});
    const [liveLoading, setLiveLoading] = useState(false);

    // Audit (edit mode): who created / last updated this scene
    const [audit, setAudit] = useState<{ created_by?: string | null; updated_by?: string | null }>({});

    // Metadata
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [displayNamesStr, setDisplayNamesStr] = useState(emptyDisplayNamesText);
    const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>('edge');
    const [priority, setPriority] = useState(isPreset ? PRESET_PRIORITY_FLOOR : 1);
    const [isEnabled, setIsEnabled] = useState(true);

    // Tree + actions
    const [rootGroup, setRootGroup] = useState<EGroup>(makeGroup('AND'));
    const [actions, setActions] = useState<EAction[]>([]);

    // Pickers
    const [showCondPicker, setShowCondPicker] = useState(false);
    const [showActionPicker, setShowActionPicker] = useState(false);

    // Copy-from preview popover (keyed by CopyCandidate.key, not by scene id — a draft
    // of an unsaved package has no id).
    const [hover, setHover] = useState<{ key: string; top: number; left: number } | null>(null);
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
    const vsById = useMemo(() => Object.fromEntries(virtualSensors.map(v => [v.id, v])) as Record<string, VirtualSensor>, [virtualSensors]);
    // deviceId → "<zone> · <device>", with the device code appended if that still collides.
    const deviceLabels = useMemo(
        () => buildDeviceLabels(devices, zones, i18n.language, t('detail.unassigned')),
        [devices, zones, i18n.language, t],
    );
    const labelOfDevice = (deviceId?: string | null) => (deviceId && deviceLabels[deviceId]) || '';
    // Read-only scene labels follow display_names; the editable `name` field stays raw.
    const nameOfScene = (s?: AutomationScene | null) => localizedName(s, i18n.language);

    // Every register that may take part in an aggregate: the `value` register of an
    // active sensor device anywhere in the farm (what the BE accepts as a source).
    const aggCandidates = useMemo(() => {
        const out: Array<{ register: Register; device: Device }> = [];
        devices
            .filter(d => d.device_kind === 'sensor' && d.is_active)
            .forEach(d => (registersByDevice[d.id] || [])
                .filter(r => r.role === 'value' && r.is_active)
                .forEach(r => out.push({ register: r, device: d })));
        // Sort by the zone-qualified label so the picker groups sensors by zone.
        return out.sort((a, b) => (deviceLabels[a.device.id] || '').localeCompare(deviceLabels[b.device.id] || ''));
    }, [devices, registersByDevice, deviceLabels]);

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
                // Virtual sensors are needed before hydration (an aggregate condition
                // stores only its id). A farm without the endpoint yet degrades to
                // "aggregate read-only" rather than blocking the whole editor.
                const [regMap, usersList, zoneList, vsList] = await Promise.all([
                    buildRegisterMap(devs),
                    usersApi.getAll().catch(() => [] as UserResponse[]),
                    // Only used to qualify device names — an empty list just means the
                    // labels fall back to the bare device name.
                    zonesApi.getByFarm(farmId).catch(err => {
                        console.warn('Failed to load zones:', err);
                        return [] as Zone[];
                    }),
                    virtualSensorsApi.getByFarm(farmId).catch(err => {
                        console.warn('Failed to load virtual sensors:', err);
                        return null;
                    }),
                ]);
                if (cancelled) return;
                setDevices(devs);
                setZones(zoneList);
                setRegistersByDevice(regMap);
                const umap: Record<string, UserResponse> = {};
                usersList.forEach(u => { umap[u.id] = u; });
                setUsers(umap);
                setVirtualSensors(vsList ?? []);
                setVsUnavailable(vsList === null);

                const regToDev: Record<string, string> = {};
                Object.entries(regMap).forEach(([devId, regs]) => regs.forEach(r => { regToDev[r.id] = devId; }));
                const vsMap = Object.fromEntries((vsList ?? []).map(v => [v.id, v])) as Record<string, VirtualSensor>;
                const devMap = Object.fromEntries(devs.map(d => [d.id, d])) as Record<string, Device>;

                if (builder) {
                    // Rule-builder: hydrate from the in-memory payload, never from the API.
                    if (builder.initial) {
                        applyDetail(builder.initial, regToDev, devMap, vsMap);
                        setView('wizard');
                    } else {
                        // Adding a rule → offer "start fresh or clone one", exactly like a
                        // single rule does, but only when there is something to clone.
                        setView(builder.copySources?.length ? 'entry' : 'wizard');
                    }
                } else if (automationId) {
                    const detail = await fetchDetail(automationId);
                    if (cancelled) return;
                    applyDetail(detail, regToDev, devMap, vsMap);
                    setView('wizard');
                } else {
                    setView('entry');
                }

                // Live readings are only for the aggregate preview — fetch after the
                // form is usable and let failures pass silently.
                const sensorUnits = Array.from(new Set(
                    devs.filter(d => d.device_kind === 'sensor').map(d => d.unit_id).filter(u => u != null)
                )) as number[];
                if (sensorUnits.length) {
                    sensorsApi.getLiveByDeviceCode(farmId, sensorUnits)
                        .then(map => { if (!cancelled) setLive(map); })
                        .catch(() => { });
                }
            } catch (err: any) {
                if (!cancelled) setLoadError(err?.message || 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [farmId, automationId]);

    // Re-poll the live snapshot behind the aggregate helper.
    const refreshLive = async () => {
        const sensorUnits = Array.from(new Set(
            devices.filter(d => d.device_kind === 'sensor').map(d => d.unit_id).filter(u => u != null)
        )) as number[];
        if (!sensorUnits.length) return;
        setLiveLoading(true);
        try {
            setLive(await sensorsApi.getLiveByDeviceCode(farmId, sensorUnits));
        } catch {
            // Keep the previous snapshot; the helper labels it as unavailable if empty.
        } finally {
            setLiveLoading(false);
        }
    };

    // Hydrate the form from a fetched scene. `copy` = duplicate into a brand-new automation.
    const applyDetail = (
        detail: HydrationSource,
        regToDev: Record<string, string>,
        devMap: Record<string, Device>,
        vsMap: Record<string, VirtualSensor>,
        copy = false,
    ) => {
        // A copy is a brand-new scene → no creator/editor yet.
        setAudit(copy ? {} : { created_by: detail.created_by, updated_by: detail.updated_by });
        setName(copy ? `${detail.name} (copy)` : (detail.name || ''));
        setDescription(detail.description || '');
        setDisplayNamesStr(displayNamesToText(detail.display_names));
        setEvaluationMode(detail.evaluation_mode || 'edge');
        setPriority(Number(detail.priority) || (isPreset ? PRESET_PRIORITY_FLOOR : 1));
        setIsEnabled(detail.is_enabled ?? true);

        const mapCondition = (c: AutomationCondition): ECondition => {
            // Stored aggregate: the tree holds a virtual_sensor_id and nothing else, so it
            // hydrates as a Virtual sensor card — what is on the wire is what is on screen.
            // Its member list belongs to the virtual sensor (shared by every rule pointing
            // at it); the card offers "edit sensors" to fork it back into an inline
            // aggregate rather than editing a shared definition in place.
            if (c.condition_type === 'register_value' && c.virtual_sensor_id) {
                const vs = vsMap[c.virtual_sensor_id];
                return {
                    _key: newKey(),
                    condition_type: c.condition_type,
                    register_id: null,
                    virtual_sensor_id: c.virtual_sensor_id,
                    params: c.params || defaultParams(c.condition_type),
                    is_negated: !!c.is_negated,
                    is_tunable: !!c.is_tunable,
                    tunable_min: c.tunable_min ?? null,
                    tunable_max: c.tunable_max ?? null,
                    _category: 'vsensor',
                    _vsCode: vs?.code,
                    _vsOpaque: !vs,
                };
            }
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
        setName(''); setDescription(''); setDisplayNamesStr(emptyDisplayNamesText());
        setEvaluationMode('edge'); setPriority(isPreset ? PRESET_PRIORITY_FLOOR : 1); setIsEnabled(true);
        setRootGroup(makeGroup('AND')); setActions([]); setAudit({});
        setStep(1); setView('wizard');
    };

    // What the entry screen can clone: the caller's list in builder mode, otherwise the
    // scenes/presets passed in as `automations`.
    const copyCandidates: CopyCandidate[] = builder
        ? (builder.copySources ?? [])
        : automations.map(a => ({ key: a.id, id: a.id, name: nameOfScene(a) }));

    // Preserve the caller's order while splitting into labelled sections.
    const copyGroups = (() => {
        const order: string[] = [];
        const byGroup: Record<string, CopyCandidate[]> = {};
        copyCandidates.forEach(c => {
            const g = c.group || '';
            if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
            byGroup[g].push(c);
        });
        return order.map(g => ({ group: g, items: byGroup[g] }));
    })();

    // Drafts are already in memory; saved rules are fetched (and cached by the preview).
    const detailOfCandidate = (c?: CopyCandidate): HydrationSource | undefined =>
        c?.rule ?? (c?.id ? previewCache[c.id] : undefined);

    const copyFrom = async (c: CopyCandidate) => {
        if (c.rule) {
            applyDetail(c.rule, registerToDevice, deviceById, vsById, true);
            setStep(1); setView('wizard');
            return;
        }
        if (!c.id) return;
        setLoading(true);
        try {
            const detail = previewCache[c.id] || await fetchDetail(c.id);
            applyDetail(detail, registerToDevice, deviceById, vsById, true);
            setStep(1); setView('wizard');
        } catch (err: any) {
            alert(t('auto.saveFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setLoading(false);
        }
    };

    const onRowHover = (c: CopyCandidate, e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const width = 320;
        let left = r.right + 12;
        if (left + width > window.innerWidth - 12) left = Math.max(12, r.left - width - 12);
        setHover({ key: c.key, top: r.top, left });
        if (c.id && !previewCache[c.id]) {
            const id = c.id;
            fetchDetail(id)
                .then(d => setPreviewCache(p => ({ ...p, [id]: d })))
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
    // `vsIds` maps a condition's editor key → the virtual sensor id resolved for it by
    // resolveAggregates(). An aggregate condition sends virtual_sensor_id INSTEAD of
    // register_id; a plain one is byte-for-byte what it always was.
    const serializeGroup = (g: EGroup, vsIds: Record<string, string>): AutomationConditionGroup => ({
        logical_op: g.logical_op,
        display_order: 0,
        conditions: g.conditions.map((c, i) => ({
            condition_type: c.condition_type,
            ...(c.condition_type === 'register_value'
                ? (c._category === 'vsensor'
                    // Picked from the farm's virtual sensors — pass the reference through.
                    ? { virtual_sensor_id: c.virtual_sensor_id || undefined }
                    : c._aggOn
                        ? { virtual_sensor_id: vsIds[c._key] || c.virtual_sensor_id || undefined }
                        : { register_id: c.register_id || undefined })
                : {}),
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
            if (c.condition_type === 'register_value' && c._category !== 'vsensor' && !c.register_id) { errs.push(t('auto.vRegister')); flag(1); }
            // A Virtual sensor card needs a pick; an unreadable reference (_vsOpaque) is
            // passed through untouched and must not be treated as "nothing selected".
            if (c.condition_type === 'register_value' && c._category === 'vsensor' && !c.virtual_sensor_id) { errs.push(t('auto.vs.vSelect')); flag(1); }
            // Aggregate members must all be sensor `value` registers sharing one unit —
            // the pickers enforce it for added members, this catches the primary and
            // anything hydrated from an older/hand-made definition.
            if (c.condition_type === 'register_value' && c._aggOn && !c._vsOpaque) {
                const members = memberIdsOf(c);
                if (!members.length) { errs.push(t('auto.agg.vMembers')); flag(1); }
                const regs = members.map(id => registerById[id]).filter(Boolean);
                const primaryDev = c.register_id ? deviceById[registerToDevice[c.register_id] || ''] : undefined;
                if (c.register_id && registerById[c.register_id] && (registerById[c.register_id].role !== 'value' || primaryDev?.device_kind !== 'sensor')) {
                    errs.push(t('auto.agg.vPrimary')); flag(1);
                }
                if (regs.length === members.length && new Set(regs.map(unitKeyOf)).size > 1) {
                    errs.push(t('auto.agg.vUnit')); flag(1);
                }
            }
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
                        // Open degree is a percentage — the slider clamps it, hydrated data may not be.
                        if (dev?.device_type === 'open_close' && (Number(a.value) < 0 || Number(a.value) > 100)) { errs.push(t('auto.vOpenDegree')); flag(2); }
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

    // Turn every "Aggregate"-ticked condition into a virtual sensor id.
    // An existing virtual sensor with the same function + member set is reused, so two
    // rules of a package sharing MIN(temp) share one row and saving twice creates nothing.
    // Existing virtual sensors are never mutated here — other rules may point at them;
    // renaming/retiring them is the Virtual sensors tab's job.
    const resolveAggregates = async (): Promise<Record<string, string>> => {
        const out: Record<string, string> = {};
        const aggConds = rootGroup.conditions.filter(c => c.condition_type === 'register_value' && c._aggOn);
        if (!aggConds.length) return out;

        // Reuse only considers sensors that are switched on — a retired definition is not
        // evaluated by the runtime, so silently binding a new rule to it would produce a
        // condition that never fires. Codes, however, stay reserved while the row exists,
        // so `taken` spans every virtual sensor plus the farm's devices.
        const pool = virtualSensors.filter(v => v.is_active !== false);
        const taken = new Set<string>([...virtualSensors.map(v => v.code), ...devices.map(d => d.code)]);
        const created: VirtualSensor[] = [];

        for (const c of aggConds) {
            // Definition we could not read → pass the reference through untouched.
            if (c._vsOpaque && c.virtual_sensor_id) { out[c._key] = c.virtual_sensor_id; continue; }

            const members = memberIdsOf(c);
            const agg = c._agg || 'min';
            // Keep the binding this condition already had when it still describes the same
            // aggregate, so re-saving an untouched rule can't drift onto a duplicate row.
            const bound = c.virtual_sensor_id ? pool.find(v => v.id === c.virtual_sensor_id) : undefined;
            const match = (bound && bound.agg === agg && sameMembers(bound.source_register_ids || [], members))
                ? bound
                : pool.find(v => v.agg === agg && sameMembers(v.source_register_ids || [], members));
            if (match) { out[c._key] = match.id; continue; }

            const primaryReg = registerById[members[0]];
            const primaryDev = deviceById[registerToDevice[members[0]] || ''];
            const vs = await virtualSensorsApi.create(farmId, {
                code: makeVsCode(agg, primaryDev?.code || 'sensor', taken),
                name: makeVsName(agg, primaryDev?.name || '', members.length),
                agg,
                unit: primaryReg?.unit || null,
                source_register_ids: members,
            });
            taken.add(vs.code);
            pool.push(vs);
            created.push(vs);
            out[c._key] = vs.id;
        }

        if (created.length) setVirtualSensors(prev => [...prev, ...created]);
        return out;
    };

    const handleSave = async () => {
        const { msgs, step: badStep } = collectErrors();
        if (msgs.length > 0) {
            if (badStep) setStep(badStep);
            alert(msgs.join('\n'));
            return;
        }

        // Blank entries of the pre-filled scaffold are dropped, so an untouched
        // { "en": "", "ko": "" } sends nothing at all.
        const dn = parseDisplayNamesText(displayNamesStr);
        if (!dn.ok) {
            setStep(3);
            alert(t('detail.invalidJson'));
            return;
        }
        const display_names = dn.value ?? undefined;

        setSaving(true);
        try {
            let vsIds: Record<string, string>;
            try {
                vsIds = await resolveAggregates();
            } catch (err: any) {
                setStep(1);
                alert(t('auto.agg.saveFailed', { error: err?.message || 'Unknown error' }));
                return;
            }

            const body = {
                name: name.trim(),
                description: description.trim() || undefined,
                display_names,
                evaluation_mode: evaluationMode,
                priority: Number(priority) || 0,
                // Rules of a package are gated by the package's own switch.
                is_enabled: isBuilder ? true : isEnabled,
                condition_groups: [serializeGroup(rootGroup, vsIds)],
                actions: actions.map(serializeAction),
            };

            if (builder) {
                // Hand the payload back — the caller decides whether it is POSTed as
                // part of a new package or appended to an existing one.
                await builder.onSubmit(body as PresetPackageRule);
                return;
            }

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
    // Accepts both an in-progress ECondition (aggregate state in _agg/_extraRegisterIds)
    // and a raw one straight off the API (aggregate state behind virtual_sensor_id).
    const summarizeCondition = (c: AutomationCondition & Partial<Pick<ECondition, '_aggOn' | '_agg' | '_extraRegisterIds' | '_category'>>): string => {
        const neg = c.is_negated ? 'NOT ' : '';
        const p = c.params || {};
        if (c.condition_type === 'register_value' && (c._aggOn || c.virtual_sensor_id || c._category === 'vsensor')) {
            const vs = c.virtual_sensor_id ? vsById[c.virtual_sensor_id] : undefined;
            // Inline aggregate: named after its first member, since the virtual sensor
            // behind it does not exist yet. Picked one: named after itself.
            if (c._aggOn) {
                const agg = (c._agg || 'min').toUpperCase();
                const count = memberIdsOf(c as ECondition).length;
                const devId = c.register_id ? registerToDevice[c.register_id] : undefined;
                const label = labelOfDevice(devId) || vs?.name || t('auto.cat.sensor');
                const more = count > 1 ? ` +${count - 1}` : '';
                return `${neg}${agg}(${label}${more}) ${p.operator ?? '>'} ${p.value ?? '?'}`;
            }
            const agg = (vs?.agg || 'min').toUpperCase();
            const label = localizedName(vs, i18n.language) || t('auto.cat.vsensor');
            return `${neg}${agg}(${label}) ${p.operator ?? '>'} ${p.value ?? '?'}`;
        }
        switch (c.condition_type) {
            case 'time_of_day': return `${neg}@ ${p.time ?? '--:--'}`;
            case 'time_range': return `${neg}${p.start ?? '--:--'}–${p.end ?? '--:--'}`;
            case 'day_of_week': return `${neg}${(p.days || []).map((d: string) => d.toUpperCase()).join(', ') || '—'}`;
            case 'sun_event': return `${neg}${p.event ?? 'sunrise'} ${(p.offset_minutes ?? 0) >= 0 ? '+' : ''}${p.offset_minutes ?? 0}m`;
            case 'register_value': {
                const devId = c.register_id ? registerToDevice[c.register_id] : undefined;
                const label = labelOfDevice(devId) || (c.register_id && registerById[c.register_id]?.code) || t('auto.cat.sensor');
                return `${neg}${label} ${p.operator ?? '>'} ${p.value ?? '?'}`;
            }
            default: return c.condition_type;
        }
    };

    const summarizeAction = (a: AutomationAction): string => {
        switch (a.action_type) {
            case 'set_register_value': {
                let target = '?';
                if (a.target_device_id) target = labelOfDevice(a.target_device_id) || t('auto.a.device');
                else if (a.target_register_id) target = registerById[a.target_register_id]?.code || t('auto.a.register');
                return `${t('auto.sum.set', { target })} = ${a.value ?? '?'}`;
            }
            case 'notification': return `${t('auto.acat.notification')} (${a.params?.channel || 'email'})`;
            case 'delay': return `${t('auto.acat.delay')} ${a.params?.seconds ?? 0}s`;
            case 'run_automation': {
                const r = automations.find(x => x.id === a.params?.automation_id);
                return `${t('auto.acat.run_automation')}: ${nameOfScene(r) || '—'}`;
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
    const headerTitle = builder?.title
        ? builder.title
        : isPreset
            ? (isEdit ? t('preset.editTitle') : t('preset.createTitle'))
            : (isEdit ? t('auto.editRuleTitle') : t('auto.createRuleTitle'));

    // Everything the Aggregate modifier on a Sensor-reading card needs.
    const aggCtx: AggContext = {
        candidates: aggCandidates,
        registerById,
        deviceById,
        registerToDevice,
        deviceLabels,
        virtualSensors,
        vsById,
        live,
        liveLoading,
        refreshLive,
        readOnly: vsUnavailable,
    };

    // Portal to <body> so the fixed overlay's containing block is always the viewport,
    // never an ancestor's scroll/overflow/transform context (which caused the modal to
    // jitter between two positions when rendered inside the scrollable Presets tab).
    return createPortal(
        <div className={`ae-overlay ${nested ? 'ae-nested' : ''}`} onClick={onClose}>
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

                            {copyCandidates.length > 0 && (
                                <>
                                    <div className="ae-divider"><span>{t('auto.entry.copyDivider')}</span></div>
                                    {copyGroups.map(({ group, items }) => (
                                        <div className="ae-copy-list" key={group || '_'}>
                                            {group && <span className="ae-copy-group">{group}</span>}
                                            {items.map(c => (
                                                <div
                                                    key={c.key}
                                                    className="ae-copy-row"
                                                    onMouseEnter={(e) => onRowHover(c, e)}
                                                    onMouseLeave={() => setHover(null)}
                                                >
                                                    <span className="ae-copy-icon"><Fan size={16} /></span>
                                                    <span className="ae-copy-name" title={c.name}>{c.name}</span>
                                                    <button type="button" className="ae-copy-btn" onClick={() => copyFrom(c)}>
                                                        <Copy size={14} /> {t('auto.entry.copy')}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                        <div className="ae-footer">
                            <button type="button" className="ae-cancel" onClick={onClose}>{t('btn.cancel')}</button>
                        </div>

                        {hover && (() => {
                            const hovered = copyCandidates.find(c => c.key === hover.key);
                            const d = detailOfCandidate(hovered);
                            return (
                                <div className="ae-preview" style={{ top: hover.top, left: hover.left }}>
                                    <div className="ae-preview-title"><Fan size={14} /> {hovered?.name}</div>
                                    {d ? (() => {
                                        const root = d.condition_groups?.[0];
                                        const conds = root ? flattenRaw(root).map(summarizeCondition) : [];
                                        const acts = (d.actions || []).map(summarizeAction);
                                        return <SummaryView logicalOp={root?.logical_op || 'AND'} conditions={conds} actions={acts} />;
                                    })() : (
                                        <div className="ae-preview-loading"><Loader2 className="spinner" size={16} /></div>
                                    )}
                                </div>
                            );
                        })()}
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
                                                    agg={aggCtx}
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
                                                    deviceLabels={deviceLabels}
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
                                    {isBuilder ? (
                                        // A package rule has no switch of its own — members turn the
                                        // whole package on or off from their dashboard.
                                        <span className="ae-hint">{t('preset.pkg.ruleEnabledHint')}</span>
                                    ) : (
                                        <label className="ae-check">
                                            <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} />
                                            {t('auto.f.enableNow')}
                                        </label>
                                    )}

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
                                        {saving ? <Loader2 className="spinner" size={14} /> : <Save size={15} />} {saving ? t('auto.saving') : (builder?.submitLabel || t('auto.btn.save'))}
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
// Everything the Aggregate modifier needs, bundled so the card keeps a short signature.
interface AggContext {
    candidates: Array<{ register: Register; device: Device }>; // farm-wide sensor `value` registers
    registerById: Record<string, Register>;
    deviceById: Record<string, Device>;
    registerToDevice: Record<string, string>;
    deviceLabels: Record<string, string>; // deviceId → "<zone> · <device>"
    virtualSensors: VirtualSensor[]; // the farm's existing aggregates (Virtual sensor cards)
    vsById: Record<string, VirtualSensor>;
    live: Record<string, SlaveSensorReading>; // keyed by device code
    liveLoading: boolean;
    refreshLive: () => void;
    readOnly?: boolean; // virtual-sensor endpoint unavailable → show, don't edit
}

interface ConditionEditorProps {
    condition: ECondition;
    devices: Device[];
    registersByDevice: Record<string, Register[]>;
    isPreset?: boolean; // preset mode → show "tunable threshold" controls
    agg: AggContext;
    onChange: (c: ECondition) => void;
    onRemove: () => void;
}

function ConditionEditor({ condition, devices, registersByDevice, isPreset, agg, onChange, onRemove }: ConditionEditorProps) {
    const { t, i18n } = useTranslation();
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
    // Zone-qualified labels, sorted so the picker groups devices by zone.
    const condDevices = [...(filtered.length ? filtered : devices)].sort(byLabel(agg.deviceLabels));
    const labelOfDevice = (d: Device) => agg.deviceLabels[d.id] || d.name;
    const allDeviceRegisters = c._deviceId ? (registersByDevice[c._deviceId] || []) : [];
    // An aggregate only spans `value` registers, so the picker narrows to those once it is on.
    const deviceRegisters = c._aggOn ? allDeviceRegisters.filter(r => r.role === 'value') : allDeviceRegisters;
    const selectedReg = c.register_id ? allDeviceRegisters.find(r => r.id === c.register_id) : undefined;

    // ── Virtual sensor card state ──
    // The card is a reference: everything it shows (function, members, unit) is read off
    // the picked sensor, and nothing here writes back to it.
    const isVs = c.condition_type === 'register_value' && c._category === 'vsensor';
    const boundVs = c.virtual_sensor_id ? agg.vsById[c.virtual_sensor_id] : undefined;
    const vsLabel = (v: VirtualSensor) => localizedName(v, i18n.language) || v.code;
    // Retired sensors are not offered, but one a rule already points at stays listed so
    // opening that rule doesn't silently drop its binding.
    const vsOptions = agg.virtualSensors
        .filter(v => v.is_active !== false || v.id === c.virtual_sensor_id)
        .sort((a, b) => vsLabel(a).localeCompare(vsLabel(b)));

    // ── Aggregate modifier state (Sensor reading cards only) ──
    const showAggregate = c.condition_type === 'register_value' && c._category === 'sensor';
    // Both cards feed the same member/live-preview rendering below — the aggregate one
    // from the card's own state, the reference one from the virtual sensor it points at.
    const aggFn: VirtualSensorAgg = isVs ? (boundVs?.agg || 'min') : (c._agg || 'min');
    const members = isVs ? (boundVs?.source_register_ids || []) : memberIdsOf(c);
    const memberSet = new Set(members);
    const primaryUnitKey = unitKeyOf(selectedReg);
    // "+ Add sensor" offers every other farm sensor measuring the same thing (same unit).
    // A register with no unit configured can't be matched, so nothing is filtered out.
    const addable = agg.candidates.filter(x =>
        !memberSet.has(x.register.id) && (!primaryUnitKey || unitKeyOf(x.register) === primaryUnitKey));

    const labelOfRegister = (rid: string): string => {
        const devId = agg.registerToDevice[rid] || '';
        return agg.deviceLabels[devId] || agg.deviceById[devId]?.name || agg.registerById[rid]?.code || rid.slice(0, 8);
    };
    const liveOfRegister = (rid: string): number | null => {
        const dev = agg.deviceById[agg.registerToDevice[rid] || ''];
        const v = dev ? agg.live[dev.code]?.current_value : undefined;
        return typeof v === 'number' && !Number.isNaN(v) ? v : null;
    };

    const memberValues = members.map(liveOfRegister);
    const knownValues = memberValues.filter((v): v is number => v !== null);
    const aggValue = aggregateOf(aggFn, knownValues);
    const decidingIdx = decidingIndexOf(aggFn, memberValues);
    const aggUnit = (isVs ? (boundVs?.unit || agg.registerById[members[0]]?.unit) : selectedReg?.unit) || '';
    const threshold = Number(c.params?.value);
    // What the condition would evaluate to right now, negation included.
    const rawState = aggValue !== null && !Number.isNaN(threshold)
        ? compare(c.params?.operator || '>', aggValue, threshold)
        : null;
    const condState = rawState === null ? null : (c.is_negated ? !rawState : rawState);

    const toggleAggregate = (on: boolean) => {
        if (!on) { onChange({ ...c, _aggOn: false }); return; }
        // Aggregates run over `value` registers; if the card points at a status
        // register, move to this device's value register so the members stay valid.
        let register_id = c.register_id || '';
        const cur = register_id ? agg.registerById[register_id] : undefined;
        if (!cur || cur.role !== 'value') {
            register_id = allDeviceRegisters.find(r => r.role === 'value' && r.is_active)?.id || '';
        }
        onChange({ ...c, _aggOn: true, _agg: aggFn, register_id, _extraRegisterIds: c._extraRegisterIds || [] });
    };
    const addMember = (rid: string) => {
        if (!rid || memberSet.has(rid)) return;
        onChange({ ...c, _extraRegisterIds: [...(c._extraRegisterIds || []), rid] });
    };
    const removeMember = (rid: string) => {
        onChange({ ...c, _extraRegisterIds: (c._extraRegisterIds || []).filter(x => x !== rid) });
    };

    // Turn a reference back into an inline aggregate, seeded with the picked sensor's
    // members. The shared definition is left alone: saving reuses it when the list comes
    // back identical, and creates a separate one when it doesn't.
    const forkToAggregate = () => {
        if (!boundVs) return;
        const ids = boundVs.source_register_ids || [];
        onChange({
            ...c,
            _category: 'sensor',
            _aggOn: true,
            _agg: boundVs.agg,
            register_id: ids[0] || '',
            _extraRegisterIds: ids.slice(1),
            _deviceId: ids[0] ? agg.registerToDevice[ids[0]] : undefined,
            virtual_sensor_id: undefined,
            _vsCode: undefined,
        });
    };

    // ── Shared between the two aggregate-shaped cards ──
    const memberChips = (editable: boolean) => (
        <div className="ae-agg-chips">
            {members.map((rid, idx) => {
                const v = memberValues[idx];
                const deciding = decidingIdx === idx && members.length > 1;
                return (
                    <span
                        className={`ae-agg-chip ${editable && idx === 0 ? 'primary' : ''} ${deciding ? 'deciding' : ''}`}
                        key={rid}
                        title={agg.registerById[rid]?.code || rid}
                    >
                        {editable && idx === 0 && <span className="ae-agg-chip-tag">{t('auto.agg.primary')}</span>}
                        <span className="ae-agg-chip-name">{labelOfRegister(rid)}</span>
                        <span className="ae-agg-chip-val">
                            {v === null ? '—' : `${fmtNum(v)}${aggUnit ? ` ${aggUnit}` : ''}`}
                        </span>
                        {editable && idx > 0 && (
                            <button
                                type="button"
                                className="ae-agg-chip-x"
                                title={t('auto.agg.removeSensor')}
                                onClick={() => removeMember(rid)}
                            >
                                <X size={11} />
                            </button>
                        )}
                    </span>
                );
            })}
            {editable && (
                <select
                    className="ae-agg-add"
                    value=""
                    disabled={!addable.length}
                    onChange={e => { addMember(e.target.value); e.currentTarget.value = ''; }}
                >
                    <option value="">
                        {addable.length ? `+ ${t('auto.agg.addSensor')}` : t('auto.agg.noMoreSensors')}
                    </option>
                    {addable.map(x => (
                        <option key={x.register.id} value={x.register.id}>
                            {labelOfDevice(x.device)}{x.register.unit ? ` (${x.register.unit})` : ''}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );

    // "What would this condition say right now" — the aggregate of the live readings,
    // which member decides it, and the resulting true/false.
    const livePreview = (
        <div className="ae-agg-helper">
            <Info size={12} />
            <div className="ae-agg-helper-text">
                {aggValue === null ? (
                    <span className="muted">{t('auto.agg.noLive')}</span>
                ) : (
                    <>
                        <span className="ae-agg-current">
                            {t(`auto.agg.${aggFn}`)} = <strong>{fmtNum(aggValue)}</strong>{aggUnit ? ` ${aggUnit}` : ''}
                        </span>
                        {members.length > 1 && (
                            aggFn === 'avg'
                                ? <span className="ae-agg-note">{t('auto.agg.avgOf', { count: knownValues.length })}</span>
                                : decidingIdx !== null && <span className="ae-agg-note">{t('auto.agg.decidedBy', { name: labelOfRegister(members[decidingIdx]) })}</span>
                        )}
                        {knownValues.length < members.length && (
                            <span className="ae-agg-note warn">{t('auto.agg.partial', { count: members.length - knownValues.length })}</span>
                        )}
                        {condState !== null && (
                            <span className={`ae-agg-state ${condState ? 'on' : 'off'}`}>
                                {t(condState ? 'auto.agg.stateTrue' : 'auto.agg.stateFalse')}
                                <code>{`${c.is_negated ? 'NOT ' : ''}${fmtNum(aggValue)} ${c.params?.operator || '>'} ${c.params?.value ?? '?'}`}</code>
                            </span>
                        )}
                    </>
                )}
            </div>
            <button
                type="button"
                className="ae-agg-refresh"
                onClick={agg.refreshLive}
                disabled={agg.liveLoading}
                title={t('auto.agg.refresh')}
            >
                {agg.liveLoading ? <Loader2 className="spinner" size={12} /> : <RefreshCw size={12} />}
            </button>
        </div>
    );

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
                        {isVs ? (
                            <div className="ae-pfield full ae-vs">
                                <label>{t('auto.vs.field')}</label>
                                {c._vsOpaque ? (
                                    <div className="ae-agg-opaque">
                                        <AlertTriangle size={13} />
                                        <span>{t('auto.agg.opaque')}</span>
                                    </div>
                                ) : (
                                    <>
                                        <select
                                            value={c.virtual_sensor_id || ''}
                                            disabled={agg.readOnly}
                                            onChange={e => onChange({ ...c, virtual_sensor_id: e.target.value, _vsCode: agg.vsById[e.target.value]?.code })}
                                        >
                                            <option value="">{t('auto.vs.select')}</option>
                                            {vsOptions.map(v => (
                                                <option key={v.id} value={v.id}>
                                                    {vsLabel(v)} · {v.agg.toUpperCase()}{v.unit ? ` (${v.unit})` : ''}
                                                    {v.is_active === false ? ` — ${t('auto.vs.inactive')}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="ae-hint">
                                            {agg.readOnly
                                                ? t('auto.agg.unavailable')
                                                : vsOptions.length ? t('auto.vs.hint') : t('auto.vs.none')}
                                        </span>

                                        {boundVs && (
                                            <div className="ae-agg-body">
                                                {boundVs.is_active === false && (
                                                    <div className="ae-agg-opaque">
                                                        <AlertTriangle size={13} />
                                                        <span>{t('auto.vs.inactiveWarn')}</span>
                                                    </div>
                                                )}
                                                <div className="ae-agg-row">
                                                    <span className="ae-agg-caption">{t('auto.agg.function')}</span>
                                                    <span className="ae-vs-fn">{t(`auto.agg.${boundVs.agg}`)}</span>
                                                    <code className="ae-vs-code">{boundVs.code}</code>
                                                </div>
                                                <div className="ae-agg-row">
                                                    <span className="ae-agg-caption">{t('auto.agg.members', { count: members.length })}</span>
                                                    {memberChips(false)}
                                                </div>
                                                {livePreview}
                                                <div className="ae-vs-actions">
                                                    <button type="button" className="ae-vs-fork" onClick={forkToAggregate} disabled={agg.readOnly || !members.length}>
                                                        <Sigma size={12} /> {t('auto.vs.fork')}
                                                    </button>
                                                    <span className="ae-hint">{t('auto.vs.forkHint')}</span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="ae-pfield">
                                    <label>{t('auto.c.device')}</label>
                                    <select value={c._deviceId || ''} onChange={e => onChange({ ...c, _deviceId: e.target.value, register_id: '' })}>
                                        <option value="">{t('auto.a.selectDevice')}</option>
                                        {condDevices.map(d => <option key={d.id} value={d.id}>{labelOfDevice(d)}</option>)}
                                    </select>
                                </div>
                                <div className="ae-pfield">
                                    <label>{t('auto.c.register')}</label>
                                    <select value={c.register_id || ''} disabled={!c._deviceId} onChange={e => onChange({ ...c, register_id: e.target.value })}>
                                        <option value="">{t('auto.a.selectRegister')}</option>
                                        {deviceRegisters.map(r => <option key={r.id} value={r.id}>{r.code} ({r.role})</option>)}
                                    </select>
                                </div>
                            </>
                        )}
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

                        {/* Aggregate: a modifier on this same card, not a new condition type.
                            Unticked, the card and the payload are the plain single-register ones. */}
                        {showAggregate && (
                            <div className="ae-pfield full ae-aggregate">
                                <label className={`ae-agg-toggle ${agg.readOnly ? 'disabled' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={!!c._aggOn}
                                        disabled={agg.readOnly}
                                        onChange={e => toggleAggregate(e.target.checked)}
                                    />
                                    <Sigma size={13} />
                                    <span>{t('auto.agg.label')}</span>
                                </label>
                                <span className="ae-hint">{agg.readOnly ? t('auto.agg.unavailable') : t('auto.agg.hint')}</span>

                                {c._aggOn && (
                                    <div className="ae-agg-body">
                                        {c._vsOpaque ? (
                                            <div className="ae-agg-opaque">
                                                <AlertTriangle size={13} />
                                                <span>{t('auto.agg.opaque')}</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="ae-agg-row">
                                                    <span className="ae-agg-caption">{t('auto.agg.function')}</span>
                                                    <div className="ae-logic-toggle">
                                                        {AGGS.map(a => (
                                                            <button
                                                                type="button"
                                                                key={a}
                                                                className={aggFn === a ? 'active' : ''}
                                                                onClick={() => onChange({ ...c, _agg: a })}
                                                            >
                                                                {t(`auto.agg.${a}`)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="ae-agg-row">
                                                    <span className="ae-agg-caption">{t('auto.agg.members', { count: members.length })}</span>
                                                    {memberChips(true)}
                                                </div>

                                                {livePreview}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

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

// ── Open degree (0–100 %) ──
// open_close actuators take a percentage, so a slider is quicker and safer to set than
// a free-typed number; the box next to it keeps exact values one keystroke away.
function OpenDegreeField({ value, onChange }: { value?: number | null; onChange: (v: number) => void }) {
    const { t } = useTranslation();
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const current = clamp(Number(value) || 0);

    return (
        <div className="ae-pfield full ae-degree">
            <label>{t('auto.a.openDegree')}</label>
            <div className="ae-degree-row">
                <input
                    type="range"
                    className="ae-degree-slider"
                    min={0}
                    max={100}
                    step={1}
                    value={current}
                    onChange={e => onChange(clamp(Number(e.target.value)))}
                />
                <div className="ae-degree-num">
                    <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={current}
                        onChange={e => onChange(e.target.value === '' ? 0 : clamp(Number(e.target.value)))}
                    />
                    <span>%</span>
                </div>
            </div>
            <div className="ae-degree-marks">
                <span>{t('auto.a.degreeClosed')}</span>
                <span>{t('auto.a.degreeOpen')}</span>
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
    deviceLabels: Record<string, string>; // deviceId → "<zone> · <device>"
    automations: AutomationScene[];
    onChange: (a: EAction) => void;
    onRemove: () => void;
}

function ActionEditor({ action, index, devices, registersByDevice, deviceLabels, automations, onChange, onRemove }: ActionEditorProps) {
    const { t, i18n } = useTranslation();
    const a = action;
    const setParam = (key: string, value: any) => onChange({ ...a, params: { ...a.params, [key]: value } });

    // Zone-qualified labels, sorted so both pickers group devices by zone.
    const labelOfDevice = (d: Device) => deviceLabels[d.id] || d.name;
    const sortedDevices = [...devices].sort(byLabel(deviceLabels));
    const actuators = sortedDevices.filter(d => d.device_type === 'switch' || d.device_type === 'open_close');
    const selectedDevice = devices.find(d => d.id === a.target_device_id);
    const writableRegisters = a._deviceId ? (registersByDevice[a._deviceId] || []).filter(r => r.writable) : [];
    const selectedRegister = a.target_register_id ? writableRegisters.find(r => r.id === a.target_register_id) : undefined;

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
                                        {actuators.map(d => <option key={d.id} value={d.id}>{labelOfDevice(d)} · {d.device_type}</option>)}
                                    </select>
                                </div>
                                {selectedDevice?.device_type === 'switch' ? (
                                    <div className="ae-pfield short">
                                        <label>{t('auto.a.value')}</label>
                                        <div className="ae-onoff">
                                            <button type="button" className={Number(a.value) === 1 ? 'active' : ''} onClick={() => onChange({ ...a, value: 1 })}>{t('auto.a.on')}</button>
                                            <button type="button" className={Number(a.value) === 0 ? 'active' : ''} onClick={() => onChange({ ...a, value: 0 })}>{t('auto.a.off')}</button>
                                        </div>
                                    </div>
                                ) : selectedDevice?.device_type === 'open_close' ? (
                                    // An open degree is a percentage — dragging beats typing.
                                    <OpenDegreeField value={a.value} onChange={v => onChange({ ...a, value: v })} />
                                ) : (
                                    <div className="ae-pfield short">
                                        <label>{t('auto.a.value')}</label>
                                        <input type="number" min={0} value={a.value ?? 0} onChange={e => onChange({ ...a, value: e.target.value === '' ? 0 : Number(e.target.value) })} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="ae-action-row">
                                <div className="ae-pfield">
                                    <label>{t('auto.a.device')}</label>
                                    <select value={a._deviceId || ''} onChange={e => onChange({ ...a, _deviceId: e.target.value, target_register_id: '' })}>
                                        <option value="">{t('auto.a.selectDevice')}</option>
                                        {sortedDevices.map(d => <option key={d.id} value={d.id}>{labelOfDevice(d)}</option>)}
                                    </select>
                                </div>
                                <div className="ae-pfield">
                                    <label>{t('auto.a.register')}</label>
                                    <select value={a.target_register_id || ''} disabled={!a._deviceId} onChange={e => onChange({ ...a, target_register_id: e.target.value })}>
                                        <option value="">{t('auto.a.selectRegister')}</option>
                                        {writableRegisters.map(r => <option key={r.id} value={r.id}>{r.code} ({r.role})</option>)}
                                    </select>
                                </div>
                                {selectedRegister?.role === 'open_degree' ? (
                                    // Same control as the device mode: this register IS an open degree.
                                    <OpenDegreeField value={a.value} onChange={v => onChange({ ...a, value: v })} />
                                ) : (
                                    <div className="ae-pfield short">
                                        <label>{t('auto.a.value')}</label>
                                        <input type="number" step="any" value={a.value ?? 0} onChange={e => onChange({ ...a, value: e.target.value === '' ? 0 : Number(e.target.value) })} />
                                    </div>
                                )}
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
                            {automations.map(r => <option key={r.id} value={r.id}>{localizedName(r, i18n.language)}</option>)}
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
