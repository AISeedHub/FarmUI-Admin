import { Farm, Module, Register } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/admin';

// Helper function to handle fetch responses
const fetchJson = async (url: string, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {})
        },
        ...options
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
