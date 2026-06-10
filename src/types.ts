export interface Farm {
    id: string; // uuid
    code: string;
    name: string;
    location: string;
    timezone: string;
    default_language: string;
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
    default_unit_id: number;
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





