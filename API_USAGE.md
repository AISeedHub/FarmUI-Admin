# FarmUI Admin — Tổng hợp API mà Frontend sử dụng

Tài liệu này liệt kê chi tiết toàn bộ các API endpoint backend mà Frontend (Admin UI) sử dụng, bao gồm method trong code, endpoint thực tế, request body và response structure. Tất cả các API này được định nghĩa tại [`src/api/services.ts`](file:///c:/Users/Andrew/Documents/Project/FarmUI-Admin/src/api/services.ts).

---

## 1. Cấu hình Chung & Giao thức

- **Base URL** — `VITE_API_BASE_URL` (được đọc từ biến môi trường `import.meta.env.VITE_API_BASE_URL`). Nếu chạy ở môi trường local dev và biến này trống, các request sẽ đi qua Vite proxy.
- **Authorization** — Ngoại trừ endpoint đăng nhập (`POST /auth/login`), mọi request khác đều đính kèm token trong Header:
  ```http
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
  Token được lưu trữ và lấy từ `localStorage.getItem('access_token')`.
- **Xử lý lỗi** — Bất kỳ phản hồi HTTP nào không có mã trạng thái dạng 2xx sẽ kích hoạt quăng lỗi (`throw new Error("API Error: <status> <statusText>")`).

---

## 2. Danh sách Endpoint chi tiết theo Resource

### A. Quản lý Trang trại (`farmsApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `farmsApi.getAll` | `GET` | `/farms` | — | `Farm[]` | Lấy toàn bộ danh sách farm. |
| `farmsApi.getById` | `GET` | `/farms/{id}` | — | `Farm` | Lấy thông tin chi tiết một farm theo ID. |
| `farmsApi.create` | `POST` | `/farms` | `Omit<Farm, 'id' \| 'created_at'>` | `Farm` | Tạo mới farm. |
| `farmsApi.update` | `PUT` | `/farms/{id}` | `Partial<Farm>` | `Farm` | Cập nhật thông tin farm. |
| `farmsApi.delete` | `DELETE` | `/farms/{id}` | — | `boolean` | Xóa farm theo ID (trả về trạng thái thành công). |
| `farmsApi.exportConfig` | `GET` | `/farms/{id}/export` | — | `any` (JSON) | Xuất file cấu hình của farm. |
| `farmsApi.clone` | `POST` | `/farms/{sourceFarmId}/clone` | `FarmCloneRequest` | `FarmCloneResponse` | Clone tài nguyên từ farm nguồn sang farm đích. |

---

### B. Quản lý Phân khu (`zonesApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `zonesApi.getByFarm` | `GET` | `/farms/{farmId}/zones` | — | `Zone[]` | Lấy danh sách các zone của một farm. |
| `zonesApi.create` | `POST` | `/zones` | `Omit<Zone, 'id' \| 'created_at'>` | `Zone` | Tạo mới một zone. |
| `zonesApi.update` | `PUT` | `/zones/{id}` | `Partial<Zone>` | `Zone` | Cập nhật thông tin zone. |
| `zonesApi.delete` | `DELETE` | `/zones/{id}` | — | `boolean` | Xóa zone theo ID. |

---

### C. Quản lý Thiết bị (`devicesApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `devicesApi.getByFarm` | `GET` | `/farms/{farmId}/devices` | — | `Device[]` | Lấy danh sách thiết bị thuộc một farm. |
| `devicesApi.create` | `POST` | `/devices` | `Omit<Device, 'id' \| 'created_at'>` | `Device` | Tạo mới một thiết bị. |
| `devicesApi.update` | `PUT` | `/devices/{id}` | `Partial<Device>` | `Device` | Cập nhật thông tin thiết bị. |
| `devicesApi.delete` | `DELETE` | `/devices/{id}` | — | `boolean` | Xóa thiết bị theo ID. |

---

### D. Quản lý Thanh ghi (`registersApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `registersApi.getByDevice` | `GET` | `/devices/{deviceId}/registers` | — | `Register[]` | Lấy danh sách thanh ghi của một thiết bị. |
| `registersApi.create` | `POST` | `/registers` | `Omit<Register, 'id' \| 'created_at'>` | `Register` | Tạo mới thanh ghi. |
| `registersApi.update` | `PUT` | `/registers/{id}` | `Partial<Register>` | `Register` | Cập nhật thông tin thanh ghi. |
| `registersApi.delete` | `DELETE` | `/registers/{id}` | — | `boolean` | Xóa thanh ghi. |

---

### E. Quản lý Tài khoản & Phân quyền (`authApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `authApi.login` | `POST` | `/auth/login` | `{ username, password }` | `{ access_token, token_type }` | Đăng nhập hệ thống (không cần token). |
| `authApi.getUsers` | `GET` | `/users` | — | `UserResponse[]` | Lấy danh sách toàn bộ user trên hệ thống. |
| `authApi.getMyFarms` | `GET` | `/auth/me/farms` | — | `MyFarmResponse[]` | Lấy danh sách các farm mà user hiện tại được quyền truy cập. |

---

### F. Quản lý Thành viên trong Trang trại (`farmUsersApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `farmUsersApi.create` | `POST` | `/farm-users` | `FarmUserCreate` | `FarmUserResponse` | Gán quyền cho một user vào một farm. |
| `farmUsersApi.getByFarm` | `GET` | `/farms/{farmId}/users` | — | `FarmUserDetail[]` | Lấy danh sách thành viên chi tiết của một farm. |
| `farmUsersApi.update` | `PUT` | `/farm-users/{farmUserId}` | `{ role: 'admin' \| 'operator' \| 'viewer' }` | `FarmUserResponse` | Cập nhật vai trò (role) của thành viên trong farm. |
| `farmUsersApi.delete` | `DELETE` | `/farm-users/{farmUserId}` | — | `boolean` | Xóa thành viên khỏi farm (thu hồi quyền truy cập). |

---

### G. Quản lý Tài khoản Hệ thống (`usersApi`)

| Tên phương thức | HTTP | Endpoint | Request Body | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `usersApi.getAll` | `GET` | `/users` | — | `UserResponse[]` | Lấy danh sách người dùng. |
| `usersApi.getById` | `GET` | `/users/{userId}` | — | `UserResponse` | Lấy chi tiết thông tin một người dùng theo ID. |
| `usersApi.create` | `POST` | `/users` | `UserCreate` | `UserResponse` | Tạo tài khoản người dùng mới. |
| `usersApi.update` | `PUT` | `/users/{userId}` | `Partial<UserResponse> & { password?: string }` | `UserResponse` | Cập nhật thông tin người dùng (và đổi mật khẩu nếu có truyền). |
| `usersApi.delete` | `DELETE` | `/users/{userId}` | — | `boolean` | Xóa tài khoản người dùng khỏi hệ thống. |

---

### H. Quản lý Tự động hóa (`automationsApi`)

| Tên phương thức | HTTP | Endpoint | Request Body/Query | Response Type | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `automationsApi.getByFarm` | `GET` | `/farms/{farmId}/automations` | — | `AutomationScene[]` | Lấy danh sách automation của một farm. |
| `automationsApi.update` | `PUT` | `/automations/{id}` | `Partial<AutomationScene>` | `AutomationScene` | Cập nhật trạng thái/metadata của automation. |
| `automationsApi.delete` | `DELETE` | `/automations/{id}` | — | `boolean` | Xóa một automation. |
| `automationsApi.exportRules` | `GET` | `/farms/{farmId}/rules?format=yaml` | — | `string` (dạng YAML) | Xuất các rule tự động hóa dưới dạng YAML. |
| `automationsApi.publishRules` | `POST` | `/farms/{farmId}/rules/publish` | — | `{ success: boolean; message?: string }` | Biên dịch và phát hành rules lên MQTT. |
| `automationsApi.getActivity` | `GET` | `/farms/{farmId}/automations/activity` | `?recent_window=5` (mặc định) | `AutomationActivityMap` | Lấy số liệu thống kê hoạt động hôm nay và trạng thái chạy gần đây. |
| `automationsApi.getFrequency` | `GET` | `/farms/{farmId}/automations/frequency` | `?bucket=hour\|day&window=24` | `Record<automation_id, Array<{ bucket_start, count }>>` | Lấy dữ liệu tần suất chạy để vẽ biểu đồ mini-chart. |
| `automationsApi.getExecutions` | `GET` | `/automations/{automationId}/executions/detailed` | `?limit=20` (mặc định) | `ExecutionHistoryRow[]` | Lấy lịch sử chạy chi tiết của một automation cụ thể. |
| `automationsApi.getFleetFrequency` | `GET` | `/fleet/automations/frequency` | `?bucket=hour\|day&window=24` | `FleetFrequencyResponse` | Lấy tần suất kích hoạt automation của toàn bộ fleet farm (hệ thống giám sát tổng). |

---

## 3. Cấu trúc Dữ liệu Chi tiết (Request/Response Models)

Được định nghĩa chi tiết tại [`src/types.ts`](file:///c:/Users/Andrew/Documents/Project/FarmUI-Admin/src/types.ts).

### Farm
```typescript
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
```

### Zone (Phân khu)
```typescript
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
```

### Device (Thiết bị)
```typescript
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
```

### Register (Thanh ghi điều khiển/cảm biến)
```typescript
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
```

### User Responses & Payloads
```typescript
export interface UserResponse {
    id: string;
    email: string;
    username: string;
    global_role: string;
    preferred_language: string;
    is_active: boolean;
}

export interface UserCreate {
    email: string;
    username: string;
    password?: string;
    global_role: 'user' | 'super_admin';
    preferred_language: string;
    is_active?: boolean;
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
```

### Farm-User Mapping
```typescript
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

export interface FarmUserDetail {
    id: string; // farm_user_id
    farm_id: string;
    user_id: string;
    role: 'admin' | 'operator' | 'viewer';
    username?: string | null;
    email?: string;
}
```

### Clone Farm
```typescript
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
```

### Automations & Execution History
```typescript
export interface AutomationScene {
    id: string;
    farm_id: string;
    name: string;
    priority: string; // ví dụ: "P1", "P5"
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
```
