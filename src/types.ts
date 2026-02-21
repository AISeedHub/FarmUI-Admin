export interface Farm {
    id: string; // uuid
    farm_code: string;
    name: string;
    location: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface Module {
    id: string; // uuid
    farm_id: string; // uuid
    name: string;
    description: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

// Ensure the types match the ERD provided.
export type RegisterDataType = 'UNSIGNED_FLOAT' | 'SIGNED_FLOAT' | 'SIGNED_INT' | 'UNSIGNED_INT' | 'BOOL';
export type RegisterRole = 'SYSTEM_INFO' | 'INTERNAL_CONFIG' | 'ENVIRONMENT_INFO' | 'CONTROL_ACTUATOR';

export interface Register {
    id: string; // uuid
    module_id: string; // uuid
    name: string;
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
