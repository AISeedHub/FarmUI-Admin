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
export type RegisterDataType = 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'boolean';
export type RegisterRole = 'sensor' | 'control' | 'config' | 'status';

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
