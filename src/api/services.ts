

import { Farm, Zone, Device, Register, UserResponse, FarmUserCreate, FarmUserResponse, FarmCloneRequest, FarmCloneResponse, AutomationScene, AutomationActivityMap, ExecutionHistoryRow, AutomationDetail, AutomationCreatePayload, AutomationFullUpdatePayload, UserCreate, FarmUserDetail, MyFarmResponse, FleetFrequencyResponse, NotificationChannel, NotificationTemplate, PresetFullPayload, PresetPackagePayload, PresetPackageRule, PresetAvailable, PresetTuneValue, InfraHealthResponse, EdgeHealthFleetResponse, EdgeHealthHistoryResponse, Camera, CameraCreate, CameraUpdate, VirtualSensor, VirtualSensorCreate, VirtualSensorUpdate, SlaveSensorReading, PlainWriteResponse, ActuatorCommandHistoryPage } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// Auth-action endpoints stay under /auth (login, me, me/farms).
const AUTH_BASE_URL = `${API_BASE_URL}/auth`;

// Error that keeps the HTTP status and the parsed `detail` body around.
// Several endpoints answer 409 with a structured detail (e.g. the virtual sensors
// still feeding a register), and callers need those lists to build a useful prompt.
// `message` stays human-readable so existing `err?.message` call sites are unaffected.
export class ApiError extends Error {
    status: number;
    // Shape depends on the endpoint (string, validation-error list, or a structured
    // object such as { virtual_sensors: [...] }) — callers narrow it themselves.
    detail: unknown;
    constructor(status: number, statusText: string, detail: unknown) {
        super(ApiError.describe(status, statusText, detail));
        this.name = 'ApiError';
        this.status = status;
        this.detail = detail;
    }

    private static describe(status: number, statusText: string, detail: unknown): string {
        const text = ApiError.detailText(detail);
        return text ? `API Error: ${status} — ${text}` : `API Error: ${status} ${statusText}`;
    }

    // FastAPI puts either a string, an object, or a list of validation errors in `detail`.
    static detailText(detail: unknown): string {
        if (!detail) return '';
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail
                .map(d => {
                    if (typeof d === 'string') return d;
                    const e = d as { loc?: unknown[]; msg?: string };
                    return [Array.isArray(e?.loc) ? e.loc.join('.') : undefined, e?.msg].filter(Boolean).join(': ');
                })
                .filter(Boolean)
                .join('; ');
        }
        if (typeof detail === 'object') {
            const o = detail as { message?: string; detail?: string };
            return o.message || o.detail || JSON.stringify(detail);
        }
        return String(detail);
    }
}

// Helper function to handle fetch responses
const fetchJson = async (url: string, options?: RequestInit) => {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // Bỏ qua trang cảnh báo của ngrok-free (nếu không có, ngrok trả HTML không kèm header CORS)
        'ngrok-skip-browser-warning': 'true',
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
        let detail: unknown = null;
        try {
            const body = await response.json();
            detail = body?.detail ?? body;
        } catch {
            // Non-JSON error body (proxy HTML, empty 5xx) — status alone has to do.
        }
        throw new ApiError(response.status, response.statusText, detail);
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
    // Cascade-or-nothing: removes the zone, its devices and their registers in
    // one transaction. If anything else still depends on the zone the server
    // answers 409 with a DeleteConflict report and deletes nothing.
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
    // Same contract as zonesApi.delete: cascade-or-nothing (device + registers),
    // 409 + DeleteConflict report when dependents block it, nothing deleted then.
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
    // 409 with detail.virtual_sensors ([{ id, code }]) when the register still feeds
    // a virtual sensor — it has to be removed from those aggregates first.
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/registers/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    }
};

// ── Cameras (farm-scoped, optionally zone-scoped) ──────────────────────────
// rtsp_url returned here carries credentials — admin surface only.
export const camerasApi = {
    getByFarm: (farmId: string): Promise<Camera[]> => {
        return fetchJson(`/farms/${farmId}/cameras`);
    },
    getByZone: (zoneId: string): Promise<Camera[]> => {
        return fetchJson(`/zones/${zoneId}/cameras`);
    },
    getById: (id: string): Promise<Camera> => {
        return fetchJson(`/cameras/${id}`);
    },
    create: (data: CameraCreate): Promise<Camera> => {
        return fetchJson('/cameras', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    // Partial update — only send the fields that changed.
    update: (id: string, data: CameraUpdate): Promise<Camera> => {
        return fetchJson(`/cameras/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete: async (id: string): Promise<boolean> => {
        const result = await fetchJson(`/cameras/${id}`, { method: 'DELETE' });
        return result.success ?? true;
    }
};

export const authApi = {
    login: async (credentials: { username: string; password: string }): Promise<{ access_token: string; token_type: string }> => {
        const response = await fetch(`${AUTH_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true',
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
        const headers: Record<string, string> = {
            'ngrok-skip-browser-warning': 'true',
        };
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
    // Create a single-rule preset in a farm. Body omits farm_id (path) + is_preset
    // (server sets true); priority is clamped into the preset band server-side.
    create: (farmId: string, data: PresetFullPayload): Promise<AutomationDetail> => {
        return fetchJson(`/farms/${farmId}/presets`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    // Create a preset PACKAGE: one container row + N child rules in a single call.
    // Same endpoint as create() — the `rules` key is what selects this shape, and
    // sending a top-level condition tree alongside it is a 422. Returns the
    // container (is_group=true); re-list to see the children.
    createPackage: (farmId: string, data: PresetPackagePayload): Promise<AutomationScene> => {
        return fetchJson(`/farms/${farmId}/presets`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    // Append one rule to an existing package. `automationId` must be a container
    // (422 otherwise); a non-preset id 404s. Body is one rules[] entry.
    addRule: (automationId: string, rule: PresetPackageRule): Promise<AutomationScene> => {
        return fetchJson(`/presets/${automationId}/rules`, {
            method: 'POST',
            body: JSON.stringify(rule),
        });
    },
    // Update metadata only (name/description/priority/is_enabled/...). Works for both
    // containers and rules. Sending is_enabled=true on a row that has an exclusive_key
    // disables the farm's other presets with that key in the same transaction.
    updateMeta: (automationId: string, data: Partial<AutomationScene>): Promise<AutomationScene> => {
        return fetchJson(`/presets/${automationId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    // Full-replace a preset (wipe + rebuild tree + actions; keeps is_preset). Used by editor.
    // 422 if `automationId` is a package container — those have no condition tree, so edit
    // their metadata with updateMeta() and their children one rule at a time.
    fullUpdate: (automationId: string, data: PresetFullPayload): Promise<AutomationDetail> => {
        return fetchJson(`/presets/${automationId}/full`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    // Deleting a container cascades: the container, every child rule, and their history.
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
            is_group: p.is_group ?? undefined,
            preset_group_id: p.preset_group_id ?? null,
            exclusive_key: p.exclusive_key ?? null,
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

// ── Virtual sensors (farm-scoped MIN/AVG/MAX over N registers) ────────────
// Backing store for the "Aggregate" modifier on a Sensor-reading condition: the
// editor creates/updates one implicitly, and conditions point at it by id. Every
// write re-compiles and re-publishes the farm's rules bundle server-side.
export const virtualSensorsApi = {
    getByFarm: (farmId: string): Promise<VirtualSensor[]> => {
        return fetchJson(`/farms/${farmId}/virtual-sensors`);
    },
    getById: (virtualSensorId: string): Promise<VirtualSensor> => {
        return fetchJson(`/virtual-sensors/${virtualSensorId}`);
    },
    // `code` shares a namespace with device.code inside the farm — a clash is a 422,
    // as is any source register that is not an active sensor `value` register here.
    create: (farmId: string, data: VirtualSensorCreate): Promise<VirtualSensor> => {
        return fetchJson(`/farms/${farmId}/virtual-sensors`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    // Partial update; `code` is immutable. source_register_ids replaces the whole set.
    // 409 (detail.automations) when deactivating one that a condition still uses.
    update: (virtualSensorId: string, data: VirtualSensorUpdate): Promise<VirtualSensor> => {
        return fetchJson(`/virtual-sensors/${virtualSensorId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    // 409 (detail.automations) while still referenced by a condition.
    delete: async (virtualSensorId: string): Promise<boolean> => {
        const result = await fetchJson(`/virtual-sensors/${virtualSensorId}`, { method: 'DELETE' });
        return result?.success ?? true;
    },
};

// ── Live sensor readings ──────────────────────────────────────────────────
// Per-unit snapshot keyed by device code. Used to preview what an aggregate
// condition would evaluate to right now (which sensor decides a MIN/MAX, etc.).
export const sensorsApi = {
    getSlaveSensors: async (farmId: string, slaveId: number): Promise<SlaveSensorReading[]> => {
        const raw = await fetchJson(`/farms/${farmId}/slaves/${slaveId}/sensors`);
        return Array.isArray(raw) ? raw : (raw?.sensors ?? []);
    },
    // Merge the snapshots of several units into one device_code → reading map.
    // Units that fail (offline gateway, 404) are skipped rather than failing the batch.
    getLiveByDeviceCode: async (farmId: string, slaveIds: number[]): Promise<Record<string, SlaveSensorReading>> => {
        const results = await Promise.all(
            slaveIds.map(id => sensorsApi.getSlaveSensors(farmId, id).catch(() => [] as SlaveSensorReading[]))
        );
        const map: Record<string, SlaveSensorReading> = {};
        results.flat().forEach(r => { if (r?.device) map[r.device] = r; });
        return map;
    },
};

// ── Direct register control (Advanced control tab) ─────────────────────────
// One-shot write of a single register value over the farm's MQTT channel. Unlike
// the register-map CRUD above (a master copy applied manually via YAML export),
// this talks to the *running* FarmLink. BE resolves device/slave/register code from
// register_id and is the final validator (writable, active, data_type shape,
// min/max) — the FE pre-checks the same rules only to disable the button early.
export const controlApi = {
    plainWrite: (farmId: string, registerId: string, value: number): Promise<PlainWriteResponse> => {
        return fetchJson(`/farms/${farmId}/registers/${registerId}/plain-write`, {
            method: 'POST',
            body: JSON.stringify({ value }),
        });
    },
    // Server-side audit trail of plain writes: the `source=api` slice of the shared
    // actuator_commands history (names pre-joined, newest first).
    getWriteHistory: (farmId: string, limit = 50, offset = 0): Promise<ActuatorCommandHistoryPage> => {
        return fetchJson(`/farms/${farmId}/actuator-commands?source=api&limit=${limit}&offset=${offset}`);
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


