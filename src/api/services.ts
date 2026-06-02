import { Farm, Zone, Device, Register, UserResponse, FarmUserCreate, FarmUserResponse, FarmCloneRequest, FarmCloneResponse, AutomationScene, AutomationActivityMap, ExecutionHistoryRow, UserCreate, FarmUserDetail, MyFarmResponse } from '../types';

// After the BE refactor all resource routers live at the root (no `/admin` prefix).
// Resources: /farms, /zones, /devices, /registers, /farm-users, /users, /actuator-commands, /automations ...
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// Auth-action endpoints stay under /auth (login, me, me/farms).
const AUTH_BASE_URL = `${API_BASE_URL}/auth`;

// Helper function to handle fetch responses
const fetchJson = async (url: string, options?: RequestInit) => {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options?.headers as Record<string, string>) || {})
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
};

export const farmsApi = {
    getAll: (): Promise<Farm[]> => {
        return fetchJson('/farms');
    },
    getById: (id: string): Promise<Farm> => {
        return fetchJson(`/farms/${id}`);
    },
    create: (data: Omit<Farm, 'id' | 'created_at'>): Promise<Farm> => {
        return fetchJson('/farms', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (id: string, data: Partial<Farm>): Promise<Farm> => {
        return fetchJson(`/farms/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/farms/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    },
    exportConfig: (id: string): Promise<any> => {
        return fetchJson(`/farms/${id}/export`);
    },
    clone: (sourceFarmId: string, data: FarmCloneRequest): Promise<FarmCloneResponse> => {
        return fetchJson(`/farms/${sourceFarmId}/clone`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
};

export const zonesApi = {
    getByFarm: (farmId: string): Promise<Zone[]> => {
        return fetchJson(`/farms/${farmId}/zones`);
    },
    create: (data: Omit<Zone, 'id' | 'created_at'>): Promise<Zone> => {
        return fetchJson('/zones', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (id: string, data: Partial<Zone>): Promise<Zone> => {
        return fetchJson(`/zones/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/zones/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    }
};

export const devicesApi = {
    getByFarm: (farmId: string): Promise<Device[]> => {
        return fetchJson(`/farms/${farmId}/devices`);
    },
    create: (data: Omit<Device, 'id' | 'created_at'>): Promise<Device> => {
        return fetchJson('/devices', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (id: string, data: Partial<Device>): Promise<Device> => {
        return fetchJson(`/devices/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/devices/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    }
};

export const registersApi = {
    getByDevice: (deviceId: string): Promise<Register[]> => {
        return fetchJson(`/devices/${deviceId}/registers`);
    },
    create: (data: Omit<Register, 'id' | 'created_at'>): Promise<Register> => {
        return fetchJson('/registers', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (id: string, data: Partial<Register>): Promise<Register> => {
        return fetchJson(`/registers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/registers/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    }
};

export const authApi = {
    login: async (credentials: { username: string; password: string }): Promise<{ access_token: string; token_type: string }> => {
        const response = await fetch(`${AUTH_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
        });

        if (!response.ok) {
            throw new Error(`Login Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },
    // User CRUD moved out of /auth into the /users resource router (Phase 2).
    getUsers: (): Promise<UserResponse[]> => {
        return fetchJson('/users');
    },
    getMyFarms: (): Promise<MyFarmResponse[]> => {
        return fetchJson('/auth/me/farms');
    }
};

export const farmUsersApi = {
    create: (data: FarmUserCreate): Promise<FarmUserResponse> => {
        return fetchJson('/farm-users', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    getByFarm: (farmId: string): Promise<FarmUserDetail[]> => {
        return fetchJson(`/farms/${farmId}/users`);
    },
    update: (farmUserId: string, data: { role: 'admin' | 'operator' | 'viewer' }): Promise<FarmUserResponse> => {
        return fetchJson(`/farm-users/${farmUserId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (farmUserId: string): Promise<boolean> => {
        await fetchJson(`/farm-users/${farmUserId}`, { method: 'DELETE' });
        return true;
    }
};

export const usersApi = {
    getAll: (): Promise<UserResponse[]> => {
        return fetchJson('/users');
    },
    getById: (userId: string): Promise<UserResponse> => {
        return fetchJson(`/users/${userId}`);
    },
    create: (data: UserCreate): Promise<UserResponse> => {
        return fetchJson('/users', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (userId: string, data: Partial<UserResponse> & { password?: string }): Promise<UserResponse> => {
        return fetchJson(`/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (userId: string): Promise<boolean> => {
        await fetchJson(`/users/${userId}`, { method: 'DELETE' });
        return true;
    }
};


export const automationsApi = {
    getByFarm: (farmId: string): Promise<AutomationScene[]> => {
        return fetchJson(`/farms/${farmId}/automations`);
    },
    update: (id: string, data: Partial<AutomationScene>): Promise<AutomationScene> => {
        return fetchJson(`/automations/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/automations/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    },
    exportRules: async (farmId: string): Promise<string> => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${API_BASE_URL}/farms/${farmId}/rules?format=yaml`, { headers });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        return response.text();
    },
    publishRules: (farmId: string): Promise<{ success: boolean; message?: string }> => {
        return fetchJson(`/farms/${farmId}/rules/publish`, {
            method: 'POST',
        });
    },
    getActivity: (farmId: string): Promise<AutomationActivityMap> => {
        return fetchJson(`/farms/${farmId}/automations/activity?recent_window=5`);
    },
    getFrequency: async (farmId: string, bucket: 'hour' | 'day' = 'hour', window: number = 24): Promise<Record<string, Array<{ bucket_start: string; count: number }>>> => {
        const raw = await fetchJson(`/farms/${farmId}/automations/frequency?bucket=${bucket}&window=${window}`);
        const result: Record<string, Array<{ bucket_start: string; count: number }>> = {};
        if (Array.isArray(raw)) {
            raw.forEach((item: any) => {
                if (item.automation_id && Array.isArray(item.buckets)) {
                    result[item.automation_id] = item.buckets;
                }
            });
        }
        return result;
    },
    getExecutions: (automationId: string, limit: number = 20): Promise<ExecutionHistoryRow[]> => {
        return fetchJson(`/automations/${automationId}/executions/detailed?limit=${limit}`);
    }
};

