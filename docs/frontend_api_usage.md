# Frontend API Usage

This document lists **every backend endpoint the FarmUI-Admin frontend actually calls**, after the
backend 3-tier refactor. All calls are defined in [`src/api/services.ts`](../src/api/services.ts).

## Conventions

- **Base URL** — `VITE_API_BASE_URL` (root of the backend, no `/admin` prefix). Empty in local dev so
  requests flow through the Vite proxy (see [`vite.config.ts`](../vite.config.ts)).
- **Auth** — every request except `POST /auth/login` sends `Authorization: Bearer <access_token>`
  (token read from `localStorage["access_token"]`). Content type is always `application/json`.
- **Errors** — any non-2xx response throws `Error("API Error: <status> <statusText>")`. The frontend
  relies on HTTP status codes (e.g. 404), not on an `error` field inside a 200 body.
- **Path scoping** — resources owned by a farm are nested under `/farms/{farm_id}/...`; resources
  addressed directly by UUID use `/{resource}/{id}`.

## Endpoint summary

| Service method | Method | Path | Request body | Response |
|---|---|---|---|---|
| `authApi.login` | `POST` | `/auth/login` | `{ username, password }` | `{ access_token, token_type }` |
| `authApi.getUsers` | `GET` | `/users` | — | `UserResponse[]` |
| `farmsApi.getAll` | `GET` | `/farms` | — | `Farm[]` |
| `farmsApi.getById` | `GET` | `/farms/{farm_id}` | — | `Farm` |
| `farmsApi.create` | `POST` | `/farms` | `Farm` (no `id`/`created_at`) | `Farm` |
| `farmsApi.update` | `PUT` | `/farms/{farm_id}` | `Partial<Farm>` | `Farm` |
| `farmsApi.delete` | `DELETE` | `/farms/{farm_id}` | — | `{ success }` |
| `farmsApi.exportConfig` | `GET` | `/farms/{farm_id}/export` | — | farm config (JSON) |
| `farmsApi.clone` | `POST` | `/farms/{farm_id}/clone` | `FarmCloneRequest` | `FarmCloneResponse` |
| `zonesApi.getByFarm` | `GET` | `/farms/{farm_id}/zones` | — | `Zone[]` |
| `zonesApi.create` | `POST` | `/zones` | `Zone` (no `id`/`created_at`) | `Zone` |
| `zonesApi.update` | `PUT` | `/zones/{zone_id}` | `Partial<Zone>` | `Zone` |
| `zonesApi.delete` | `DELETE` | `/zones/{zone_id}` | — | `{ success }` |
| `devicesApi.getByFarm` | `GET` | `/farms/{farm_id}/devices` | — | `Device[]` |
| `devicesApi.create` | `POST` | `/devices` | `Device` (no `id`/`created_at`) | `Device` |
| `devicesApi.update` | `PUT` | `/devices/{device_id}` | `Partial<Device>` | `Device` |
| `devicesApi.delete` | `DELETE` | `/devices/{device_id}` | — | `{ success }` |
| `registersApi.getByDevice` | `GET` | `/devices/{device_id}/registers` | — | `Register[]` |
| `registersApi.create` | `POST` | `/registers` | `Register` (no `id`/`created_at`) | `Register` |
| `registersApi.update` | `PUT` | `/registers/{register_id}` | `Partial<Register>` | `Register` |
| `registersApi.delete` | `DELETE` | `/registers/{register_id}` | — | `{ success }` |
| `farmUsersApi.create` | `POST` | `/farm-users` | `FarmUserCreate` | `FarmUserResponse` |

## Details by resource

### Auth (`authApi`)

- **`POST /auth/login`** — the only unauthenticated call. Body `{ username, password }`, returns
  `{ access_token, token_type }`. The frontend stores `access_token` in `localStorage`.
- **`GET /users`** — list users. (Moved out of `/auth/users` into the `/users` resource router in the
  refactor.) Returns `UserResponse[]`.

### Farms (`farmsApi`)

Full CRUD plus two actions:

- **`GET /farms`** → `Farm[]`
- **`GET /farms/{farm_id}`** → `Farm`
- **`POST /farms`** — create. Body is a `Farm` without `id`/`created_at`.
- **`PUT /farms/{farm_id}`** — update. Body is a partial `Farm`.
- **`DELETE /farms/{farm_id}`** — cascades to related entities. Returns `{ success }` (frontend
  defaults to `true` when the field is absent).
- **`GET /farms/{farm_id}/export`** — export the farm config as JSON.
- **`POST /farms/{farm_id}/clone`** — body `FarmCloneRequest` `{ target_farm_id }`, returns
  `FarmCloneResponse` `{ source_farm_id, target_farm_id, zones, devices, registers, automations }`.

### Zones (`zonesApi`)

- **`GET /farms/{farm_id}/zones`** → `Zone[]` (farm-scoped list)
- **`POST /zones`** — create. Body is a `Zone` without `id`/`created_at` (includes `farm_id`).
- **`PUT /zones/{zone_id}`** — update. Body is a partial `Zone`.
- **`DELETE /zones/{zone_id}`** — cascades. Returns `{ success }`.

### Devices (`devicesApi`)

- **`GET /farms/{farm_id}/devices`** → `Device[]` (farm-scoped list)
- **`POST /devices`** — create. Body is a `Device` without `id`/`created_at`.
- **`PUT /devices/{device_id}`** — update. Body is a partial `Device`.
- **`DELETE /devices/{device_id}`** — cascades to related registers. Returns `{ success }`.

### Registers (`registersApi`)

- **`GET /devices/{device_id}/registers`** → `Register[]` (device-scoped list)
- **`POST /registers`** — create. Body is a `Register` without `id`/`created_at`.
- **`PUT /registers/{register_id}`** — update. Body is a partial `Register`.
- **`DELETE /registers/{register_id}`** — delete. Returns `{ success }`.

### Farm-Users (`farmUsersApi`)

- **`POST /farm-users`** — assign a user to a farm. Body `FarmUserCreate`
  `{ farm_id, user_id, role: "admin" | "operator" | "viewer" }`, returns `FarmUserResponse`.

## Data shapes

Request/response object shapes are defined in [`src/types.ts`](../src/types.ts): `Farm`, `Zone`,
`Device`, `Register`, `UserResponse`, `FarmUserCreate`, `FarmUserResponse`, `FarmCloneRequest`,
`FarmCloneResponse`.

## Not yet used by the frontend

The backend exposes more endpoints than the admin UI currently consumes. These are **not** called
anywhere in the frontend yet:

- **Realtime** — `GET /farms/{farm_id}/stream` (SSE), `/config`, `/status`, `/slaves`,
  `/slaves/{slave_id}`, `/linkages`.
- **Sensors** — `/farms/{farm_id}/sensors/...` specialized views.
- **Actuators** — `/farms/{farm_id}/actuators/...` including `force` / `release`.
  > Note for future work: `force`/`release` take `device_code` in the **path**, not the body.
- **Automations** — `/automations`, `/condition-groups`, `/conditions`, `/actions`, rules, executions.
- **Actuator-commands history** — `/farms/{farm_id}/actuator-commands`, `/actuator-commands`.
- **Auth** — `GET /auth/me`, `GET /auth/me/farms`.
- **Users/Farms extras** — `GET /users/{user_id}`, `PUT /users/{user_id}`, `POST /users`,
  `GET /farms/{farm_id}/users`, `PUT`/`DELETE /farm-users/{farm_user_id}`.
