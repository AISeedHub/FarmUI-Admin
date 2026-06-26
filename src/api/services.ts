

import { Farm, Zone, Device, Register, UserResponse, FarmUserCreate, FarmUserResponse, FarmCloneRequest, FarmCloneResponse, AutomationScene, AutomationActivityMap, ExecutionHistoryRow, AutomationDetail, AutomationCreatePayload, AutomationFullUpdatePayload, UserCreate, FarmUserDetail, MyFarmResponse, FleetFrequencyResponse, NotificationChannel, NotificationTemplate, PresetFullPayload, PresetAvailable, PresetTuneValue, InfraHealthResponse, EdgeHealthFleetResponse, EdgeHealthHistoryResponse } from '../types';

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
    // Full nested scene (groups + actions) — used to hydrate the edit form.
    getById: (id: string): Promise<AutomationDetail> => {
        return fetchJson(`/automations/${id}`);
    },
    // Create a whole scene in one shot (metadata + condition tree + actions). Requires Bearer.
    create: (data: AutomationCreatePayload): Promise<AutomationDetail> => {
        return fetchJson('/automations', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    update: (id: string, data: Partial<AutomationScene>): Promise<AutomationScene> => {
        return fetchJson(`/automations/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    // Full-replace a scene (wipe + rebuild condition tree + actions). Recommended for the edit form.
    fullUpdate: (id: string, data: AutomationFullUpdatePayload): Promise<AutomationDetail> => {
        return fetchJson(`/automations/${id}/full`, {
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
    getActivity: async (farmId: string): Promise<AutomationActivityMap> => {
        const raw = await fetchJson(`/farms/${farmId}/automations/activity?recent_window=5`);
        const result: AutomationActivityMap = {};
        if (Array.isArray(raw)) {
            raw.forEach((item: any) => {
                if (item.automation_id) {
                    result[item.automation_id] = {
                        count_today: item.count_today ?? 0,
                        recent_failed: item.recent_failed ?? 0,
                        last_execution: item.last_execution ?? null
                    };
                }
            });
        }
        return result;
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
    },
    getFleetFrequency: (bucket: 'hour' | 'day' = 'hour', window: number = 24): Promise<FleetFrequencyResponse> => {
        return fetchJson(`/fleet/automations/frequency?bucket=${bucket}&window=${window}`);
    }
};

// ── Presets (expert-authored, farm-scoped) ───────────────────────────────
// 6 expert-authoring ops (super_admin → 403 otherwise) + 3 farm-member ops.
// Note: GET /farms/{id}/automations does NOT include presets — they live here.
export const presetsApi = {
    // — Expert authoring (super_admin) —
    // List presets of a farm (admin view). Returns AutomationScene rows (is_preset=true).
    getByFarm: (farmId: string): Promise<AutomationScene[]> => {
        return fetchJson(`/farms/${farmId}/presets`);
    },
    // Full nested preset (groups + actions, incl. tunable flags) — hydrate the editor.
    getById: (automationId: string): Promise<AutomationDetail> => {
        return fetchJson(`/presets/${automationId}`);
    },
    // Create a preset in a farm. Body omits farm_id (path) + is_preset (server sets true);
    // priority is clamped into the preset band server-side.
    create: (farmId: string, data: PresetFullPayload): Promise<AutomationDetail> => {
        return fetchJson(`/farms/${farmId}/presets`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    // Update metadata only (name/description/priority/is_enabled/...).
    updateMeta: (automationId: string, data: Partial<AutomationScene>): Promise<AutomationScene> => {
        return fetchJson(`/presets/${automationId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    // Full-replace a preset (wipe + rebuild tree + actions; keeps is_preset). Used by editor.
    fullUpdate: (automationId: string, data: PresetFullPayload): Promise<AutomationDetail> => {
        return fetchJson(`/presets/${automationId}/full`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (automationId: string): Promise<boolean> => {
        const result = await fetchJson(`/presets/${automationId}`, { method: 'DELETE' });
        return result?.success ?? true;
    },

    // — Farm-member view + control (any farm member; super_admin always passes) —
    // Presets + their whitelisted tunable thresholds, for dashboards. Tolerant to BE
    // field-name variants so the panel can render labels/bounds regardless of shape.
    getAvailable: async (farmId: string): Promise<PresetAvailable[]> => {
        const raw = await fetchJson(`/farms/${farmId}/presets/available`);
        const list: any[] = Array.isArray(raw) ? raw : (raw?.presets ?? []);
        return list.map((p: any): PresetAvailable => ({
            id: p.id ?? p.automation_id,
            name: p.name,
            description: p.description ?? null,
            priority: p.priority,
            is_enabled: p.is_enabled ?? true,
            tunables: (p.tunables ?? p.tunable_thresholds ?? p.thresholds ?? []).map((t: any) => ({
                condition_id: t.condition_id ?? t.id,
                register_id: t.register_id ?? null,
                current_value: t.current_value ?? t.value,
                operator: t.operator,
                tunable_min: t.tunable_min ?? t.min ?? null,
                tunable_max: t.tunable_max ?? t.max ?? null,
                register_min: t.register_min ?? t.min_value ?? null,
                register_max: t.register_max ?? t.max_value ?? null,
                label: t.label ?? t.register_code ?? t.name ?? null,
                unit: t.unit ?? null,
            })),
        }));
    },
    // Enable/disable a preset (re-publishes the rules bundle server-side).
    setEnabled: (farmId: string, automationId: string, isEnabled: boolean): Promise<{ success?: boolean }> => {
        return fetchJson(`/farms/${farmId}/presets/${automationId}/enabled`, {
            method: 'PUT',
            body: JSON.stringify({ is_enabled: isEnabled }),
        });
    },
    // Tune whitelisted thresholds. All values validated before any write (atomic).
    tune: (farmId: string, automationId: string, values: PresetTuneValue[]): Promise<{ success?: boolean }> => {
        return fetchJson(`/farms/${farmId}/presets/${automationId}/tune`, {
            method: 'PUT',
            body: JSON.stringify({ values }),
        });
    },
};

export const notificationsApi = {
    // Channels
    getChannels: (scope?: 'system' | 'farm', farmId?: string | null): Promise<NotificationChannel[]> => {
        let url = '/notifications/channels';
        const params = new URLSearchParams();
        if (scope) params.append('scope', scope);
        if (farmId) params.append('farm_id', farmId);
        const query = params.toString();
        if (query) url += `?${query}`;
        return fetchJson(url);
    },
    getEventTypes: (scope: 'system' | 'farm'): Promise<Record<string, Array<{ value: string; label: string }>>> => {
        return fetchJson(`/notifications/event-types?scope=${scope}`);
    },
    createChannel: (data: Omit<NotificationChannel, 'id'>): Promise<NotificationChannel> => {
        return fetchJson('/notifications/channels', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    updateChannel: (id: string, data: Partial<NotificationChannel>): Promise<NotificationChannel> => {
        return fetchJson(`/notifications/channels/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },
    deleteChannel: async (id: string): Promise<boolean> => {
        await fetchJson(`/notifications/channels/${id}`, { method: 'DELETE' });
        return true;
    },
    testChannel: (id: string): Promise<{ success: boolean; message?: string }> => {
        return fetchJson(`/notifications/channels/${id}/test`, { method: 'POST' });
    },

    // Channel Members
    getChannelMembers: (channelId: string): Promise<any[]> => {
        return fetchJson(`/notifications/channels/${channelId}/members`);
    },
    addChannelMember: (channelId: string, userId: string): Promise<any> => {
        return fetchJson(`/notifications/channels/${channelId}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
    },
    deleteChannelMember: async (channelId: string, userId: string): Promise<boolean> => {
        await fetchJson(`/notifications/channels/${channelId}/members/${userId}`, { method: 'DELETE' });
        return true;
    },

    // Templates
    getTemplates: (): Promise<NotificationTemplate[]> => {
        return fetchJson('/notifications/templates');
    },
    createTemplate: (data: Omit<NotificationTemplate, 'id'>): Promise<NotificationTemplate> => {
        return fetchJson('/notifications/templates', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    updateTemplate: (id: string, data: Partial<NotificationTemplate>): Promise<NotificationTemplate> => {
        return fetchJson(`/notifications/templates/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },
    deleteTemplate: async (id: string): Promise<boolean> => {
        await fetchJson(`/notifications/templates/${id}`, { method: 'DELETE' });
        return true;
    },
    getTemplateVariables: (type?: string): Promise<any> => {
        const url = type ? `/notifications/template-variables?type=${type}` : '/notifications/template-variables';
        return fetchJson(url);
    },
    getLogs: (params: {
        type?: string;
        severity?: string;
        scope?: 'system' | 'farm';
        farm_id?: string | null;
        status?: string;
        since?: string;
        until?: string;
        limit?: number;
        offset?: number;
    }): Promise<any> => {
        let url = '/notifications/logs';
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                queryParams.append(key, String(val));
            }
        });
        const queryStr = queryParams.toString();
        if (queryStr) url += `?${queryStr}`;
        return fetchJson(url);
    }
};

// ── System & edge health ──────────────────────────────────────────────────
export const healthApi = {
    // Infra liveness: Postgres / InfluxDB / MQTT reachability. No auth required
    // (the Bearer header added by fetchJson is harmless here).
    getInfra: (): Promise<InfraHealthResponse> => {
        return fetchJson('/health');
    },
    // Fleet edge-health overview — latest snapshot per farm. super_admin only
    // (throws "API Error: 403" otherwise). `period` is an Influx duration.
    getFleetEdgeHealth: (period: string = '24h'): Promise<EdgeHealthFleetResponse> => {
        return fetchJson(`/admin/edge-health?period=${encodeURIComponent(period)}`);
    },
    // Time-series edge health for a single farm. `aggregate_every` (e.g. "5m")
    // downsamples numeric fields for long ranges; omit it for raw records.
    getFarmEdgeHistory: (
        farmId: string,
        period: string = '24h',
        aggregateEvery?: string
    ): Promise<EdgeHealthHistoryResponse> => {
        const params = new URLSearchParams({ period });
        if (aggregateEvery) params.append('aggregate_every', aggregateEvery);
        return fetchJson(`/farms/${farmId}/edge-health/history?${params.toString()}`);
    }
};


