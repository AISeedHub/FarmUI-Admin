export interface Farm {
    id: string; // uuid
    code: string;
    name: string;
    location: string;
    timezone: string;
    default_language: string;
    primary_crop: string | null;
    planting_date: string | null;
    latitude: number | null;
    longitude: number | null;
    weather_grid_nx: number | null;
    weather_grid_ny: number | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface Zone {
    id: string; // uuid
    farm_id: string; // uuid
    code: string;
    name: string;
    display_names?: Record<string, string> | null;
    description: string;
    // null = camera-zone (no modbus unit); a real unit id = modbus (sensor/actuator) zone.
    // Both kinds share this table; the discriminator is whether default_unit_id is set.
    default_unit_id: number | null;
    display_order: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type DeviceKind = 'sensor' | 'actuator' | 'system';
export type DeviceType = 'switch' | 'open_close' | 'sensor_group' | 'control_mode';

export interface Device {
    id: string; // uuid
    farm_id: string; // uuid
    zone_id?: string | null; // uuid
    code: string;
    name: string;
    display_names?: Record<string, string> | null;
    description: string;
    device_kind: DeviceKind;
    device_type: DeviceType;
    unit_id: number;
    display_order: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type RegisterDataType = 'FLOAT' | 'UNSIGNED_INT' | 'INT' | 'BOOL';
export type RegisterRole = 'value' | 'status' | 'command' | 'set_point' | 'open_degree';

export interface Register {
    id: string; // uuid
    device_id: string; // uuid
    code: string;
    display_names?: Record<string, string> | null;
    description: string;
    address: number;
    bit_start: number;
    bit_end: number;
    unit: string;
    writable: boolean;
    data_type: RegisterDataType;
    role: RegisterRole;
    scale_factor: number;
    is_signed: boolean;
    min_value: number;
    max_value: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface UserResponse {
    id: string;
    email: string;
    username: string;
    global_role: string;
    preferred_language: string;
    is_active: boolean;
}

export interface FarmUserCreate {
    farm_id: string;
    user_id: string;
    role: 'admin' | 'operator' | 'viewer';
}

export interface FarmUserResponse {
    id: string;
    farm_id: string;
    user_id: string;
    role: string;
    created_at: string;
}

export interface FarmCloneRequest {
    target_farm_id: string;
}

export interface FarmCloneResponse {
    source_farm_id: string;
    target_farm_id: string;
    zones: number;
    devices: number;
    registers: number;
    automations: number;
}

export interface AutomationScene {
    id: string;
    farm_id: string;
    name: string;
    priority: string; // e.g. "P1", "P5"
    is_enabled: boolean;
    description?: string;
    created_by?: string | null; // user id of creator (resolve via usersApi)
    updated_by?: string | null; // user id of last metadata/full editor; null until first edit
    created_at?: string;
    updated_at?: string;
}

export interface AutomationActivity {
    count_today: number;
    recent_failed: number;
    last_execution: {
        occurred_at: string;
        triggered_at: string;
        status: string;
        error_message: string | null;
    } | null;
}

export type AutomationActivityMap = Record<string, AutomationActivity>;

export interface ActuatorWrite {
    device_name: string;
    register_code: string;
    value: number | boolean | string;
    status: 'pending' | 'sent' | 'failed' | string;
    error_message?: string | null;
}

export interface ExecutionHistoryRow {
    id: string;
    automation_id: string;
    triggered_at: string;
    status: 'success' | 'failed' | 'partial';
    error_message?: string | null;
    actuator_writes?: ActuatorWrite[];
    trigger_source?: 'schedule' | 'sensor' | 'manual' | string;
    trigger_snapshot?: Record<string, any> | null;
    occurred_at?: string;
    completed_at?: string;
}

// ── Automation editor (create / full-edit) ───────────────────────────────
export type EvaluationMode = 'edge' | 'interval';
export type LogicalOp = 'AND' | 'OR';
export type ConditionType = 'time_of_day' | 'time_range' | 'day_of_week' | 'sun_event' | 'register_value';
export type AutomationActionType = 'set_register_value' | 'notification' | 'delay' | 'run_automation';

export interface AutomationCondition {
    id?: string;
    condition_type: ConditionType;
    register_id?: string | null;
    params: Record<string, any>;
    is_negated?: boolean;
    display_order?: number;
    // ── Preset-only (register_value conditions) ──
    // When is_tunable, farm members may adjust params.value within [tunable_min, tunable_max].
    is_tunable?: boolean;
    tunable_min?: number | null;
    tunable_max?: number | null;
}

export interface AutomationConditionGroup {
    id?: string;
    parent_group_id?: string | null;
    logical_op: LogicalOp;
    display_order?: number;
    conditions: AutomationCondition[];
    sub_groups: AutomationConditionGroup[];
}

export interface AutomationAction {
    id?: string;
    action_type: AutomationActionType;
    target_device_id?: string | null;
    target_register_id?: string | null;
    value?: number | null;
    params?: Record<string, any>;
    delay_seconds_before?: number;
    execution_order?: number;
}

// GET /automations/{id} — full nested scene used to hydrate the edit form.
export interface AutomationDetail extends AutomationScene {
    display_names?: Record<string, string> | null;
    evaluation_mode?: EvaluationMode;
    condition_groups: AutomationConditionGroup[];
    actions: AutomationAction[];
    // created_by / updated_by inherited from AutomationScene
}

// POST /automations body (full tree).
export interface AutomationCreatePayload {
    farm_id: string;
    name: string;
    display_names?: Record<string, string> | null;
    description?: string;
    evaluation_mode: EvaluationMode;
    priority: number;
    is_enabled: boolean;
    condition_groups: AutomationConditionGroup[];
    actions: AutomationAction[];
}

// PUT /automations/{id}/full body — same as create minus farm_id.
export type AutomationFullUpdatePayload = Omit<AutomationCreatePayload, 'farm_id'>;

// ── Presets (expert-authored, farm-scoped) ───────────────────────────────
// A preset is an automation row with is_preset=true, authored by a super_admin
// in a specific farm, living in a high-priority band. It reuses the whole
// condition/action tree; the only extras are tunable thresholds + dedicated
// enable/tune endpoints for farm members.

// POST /farms/{farm_id}/presets and PUT /presets/{id}/full body.
// Same shape as a full automation but WITHOUT farm_id (taken from path) and
// WITHOUT is_preset (server sets it). priority is optional (server clamps into
// the preset band; omit → floor). Conditions may carry is_tunable/tunable_min/max.
export interface PresetFullPayload {
    name: string;
    display_names?: Record<string, string> | null;
    description?: string;
    evaluation_mode: EvaluationMode;
    priority?: number;
    is_enabled: boolean;
    condition_groups: AutomationConditionGroup[];
    actions: AutomationAction[];
}

// A single whitelisted threshold a farm member can tune (from GET .../presets/available).
export interface PresetTunable {
    condition_id: string;
    register_id?: string | null;
    current_value: number;
    operator?: string;            // e.g. "<", ">="
    tunable_min?: number | null;  // expert-set lower bound
    tunable_max?: number | null;  // expert-set upper bound
    register_min?: number | null; // register min_value (hard bound)
    register_max?: number | null; // register max_value (hard bound)
    label?: string | null;        // friendly label (register code / device name) if BE provides
    unit?: string | null;
}

// GET /farms/{farm_id}/presets/available — preset row + its tunable thresholds.
export interface PresetAvailable {
    id: string;
    name: string;
    description?: string | null;
    priority?: string | number;
    is_enabled: boolean;
    tunables: PresetTunable[];
}

// PUT /farms/{farm_id}/presets/{id}/tune body.
export interface PresetTuneValue {
    condition_id: string;
    value: number;
}

export interface UserCreate {
    email: string;
    username: string;
    password?: string;
    global_role: 'user' | 'super_admin';
    preferred_language: string;
    is_active?: boolean;
}

export interface FarmUserDetail {
    id: string; // farm_user_id
    farm_id: string;
    user_id: string;
    role: 'admin' | 'operator' | 'viewer';
    username?: string | null;
    email?: string;
}

export interface MyFarmResponse {
    id: string;
    code: string;
    name: string;
    location: string | null;
    timezone: string;
    is_active: boolean;
    role: 'admin' | 'operator' | 'viewer' | null;
}

export interface FleetFrequencyFarm {
    farm_id: string;
    farm_code: string;
    farm_name: string;
    counts: number[];
    total: number;
}

export interface FleetFrequencyResponse {
    bucket: string;
    window: number;
    bucket_starts: string[];
    farms: FleetFrequencyFarm[];
}

export interface NotificationChannel {
    id: string; // uuid
    code: string;
    name: string;
    webhook_url: string;
    mention_role_id?: string | null;
    scope: 'system' | 'farm';
    farm_id?: string | null; // uuid, null = global if scope is farm
    language?: string | null; // e.g. en, ko, vi
    severities?: string[] | null;
    event_types?: string[] | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface NotificationChannelMember {
    id?: string;
    channel_id: string;
    user_id: string;
    created_at?: string;
}

export interface NotificationTemplate {
    id: string; // uuid
    type: string; // event type
    language: string; // language code e.g. vi, en, ko
    name: string;
    title_template: string;
    body_template: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface NotificationLog {
    id: string; // uuid
    channel_id?: string | null; // uuid
    type: string; // event type e.g. farm_offline
    severity: string; // info, warning, critical
    scope: 'system' | 'farm';
    farm_id?: string | null; // uuid
    title: string;
    body: string;
    status: 'success' | 'failed' | string;
    error_message?: string | null;
    created_at: string; // timestamp
    sent_at?: string; // fallback timestamp
}

// ── System & edge health ──────────────────────────────────────────────────
// GET /health — infra liveness (no auth). Reachability of Postgres/InfluxDB/MQTT.
export interface HealthComponent {
    ok: boolean;
    detail: string;
}

export interface InfraHealthResponse {
    status: 'ok' | 'degraded' | string;
    components: Record<string, HealthComponent>; // keyed by postgres / influxdb / mqtt
}

// Host + modbus snapshot published by a farm's edge gateway (FarmLink).
export interface EdgeHealthMetrics {
    cpu_usage_percent: number;
    ram_usage_percent: number;
    disk_usage_percent: number;
    uptime_seconds: number;
    modbus_connected: boolean;
    disk_free_gb: number;
}

// GET /admin/edge-health — one entry per farm (latest snapshot in the window).
// Farms without health in the window are omitted by the server.
export interface EdgeHealthFarm {
    farm_id: string;
    status: 'online' | 'offline' | string;
    time: string; // ISO timestamp of the snapshot
    metrics: EdgeHealthMetrics;
}

export interface EdgeHealthFleetResponse {
    period: string;
    farms: EdgeHealthFarm[];
}

// GET /farms/{farm_id}/edge-health/history — flat (long-format) records.
// One record = one field at one timestamp. modbus_connected is dropped when aggregated.
export interface EdgeHealthHistoryRecord {
    time: string; // ISO timestamp
    field: string; // cpu_usage_percent | ram_usage_percent | disk_usage_percent | uptime_seconds | disk_free_gb | modbus_connected
    value: number;
    status: string; // online | offline
}

export interface EdgeHealthHistoryResponse {
    farm: string; // farm code (e.g. "naju_01")
    period: string;
    records: EdgeHealthHistoryRecord[];
}

// ── Cameras (farm-scoped, optionally zone-scoped) ──────────────────────────
// FE picks the player from stream_protocol. rtsp_url carries credentials and is
// admin-only — mask it in any shared/list view.
export type StreamProtocol = 'webrtc' | 'hls' | 'rtsp';

// GET responses (CameraResponse).
export interface Camera {
    id: string; // uuid
    farm_id: string; // uuid
    zone_id: string | null; // uuid | null
    code: string; // unique within the farm
    name: string;
    display_names: Record<string, string> | null; // { "vi": "...", "en": "..." }
    description: string | null;
    rtsp_url: string; // ⚠️ includes credentials — admin-only
    stream_key: string | null; // id/path on the media server (unique when set)
    stream_protocol: StreamProtocol;
    is_active: boolean;
    display_order: number;
    created_at: string; // ISO datetime
    updated_at: string | null;
}

// POST /cameras body.
export interface CameraCreate {
    farm_id: string; // required
    zone_id?: string | null;
    code: string; // required, max 50, unique/farm
    name: string; // required, max 255
    display_names?: Record<string, string> | null;
    description?: string | null;
    rtsp_url: string; // required
    stream_key?: string | null; // max 255, globally unique when set
    stream_protocol?: StreamProtocol; // default "webrtc"
    is_active?: boolean; // default true
    display_order?: number; // default 0
}

// PUT /cameras/{id} body — all optional; send only the fields that changed.
export interface CameraUpdate {
    zone_id?: string | null;
    code?: string;
    name?: string;
    display_names?: Record<string, string> | null;
    description?: string | null;
    rtsp_url?: string;
    stream_key?: string | null;
    stream_protocol?: StreamProtocol;
    is_active?: boolean;
    display_order?: number;
}





