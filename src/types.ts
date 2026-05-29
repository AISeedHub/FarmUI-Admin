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
