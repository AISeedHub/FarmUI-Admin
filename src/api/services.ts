import { Farm, Module, Register } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/admin';
const AUTH_BASE_URL = API_BASE_URL.replace(/\/admin$/, '') + '/auth';// Helper function to handle fetch responses
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
    }
};

export const modulesApi = {
    getByFarm: (farmId: string): Promise<Module[]> => {
        return fetchJson(`/farms/${farmId}/modules`);
    },
    create: (data: Omit<Module, 'id' | 'created_at'>): Promise<Module> => {
        return fetchJson('/modules', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (id: string, data: Partial<Module>): Promise<Module> => {
        return fetchJson(`/modules/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/modules/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    }
};

export const registersApi = {
    getByModule: (moduleId: string): Promise<Register[]> => {
        return fetchJson(`/modules/${moduleId}/registers`);
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
    login: async (credentials: { email: string; password: string }): Promise<{ access_token: string; token_type: string }> => {
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
    }
};

