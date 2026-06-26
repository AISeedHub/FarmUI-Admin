# FarmUI-Admin Web App

FarmUI-Admin is a frontend web application designed for the management of "Smartfarm" configurations. It provides a visual, "Blueprint Style" interface to configure Farms, their interconnected Modules, and specific hardware Registers.

## Features

- **Blueprint Aesthetics**: A visually engaging interface featuring dark slate backgrounds, graph-paper patterns, and neon blue/orange accents designed specifically for data-driven, technical systems.
- **Bilingual Support**: Built-in support for English (EN) and Korean (KO).
- **Farm Overview**: A dashboard to create, view, update, and toggle the active status of multiple Smartfarms.
- **Visual "Blueprint" Canvas**: A node-based interactive view showcasing the relationships between the Parent Farm, its connected Modules, and the underlying Registers. 
- **Mock Service Layer**: The application uses a local storage-backed mock API to simulate backend interactions, complete with artificial network delays.

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS (CSS variables, flex/grid layouts)
- **Routing**: React Router DOM (v6)
- **i18n**: react-i18next
- **Icons**: Lucide React

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation
1. Navigate to the root directory `FarmUI-Admin`
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the development server:
```bash
npm run dev
```

Open `http://localhost:5173` (or the port specified by Vite) in your browser. 

**Default Login Credentials:**
- **Username:** `admin`
- **Password:** `admin`

## Backend API Integration Status

FarmUI-Admin communicates with the SmartFarm FastAPI backend. Sau đợt refactor 3-tier, các endpoint nằm ở **root** theo resource (không còn tiền tố `/admin`). Auth-action giữ dưới `/auth`.

### Implemented APIs (Mapped to Frontend Services)

**Farms**
- `GET /farms` : Lấy danh sách farms (mapped to `farmsApi.getAll()`)
- `GET /farms/{farm_id}` : Lấy thông tin chi tiết 1 farm (mapped to `farmsApi.getById()`)
- `POST /farms` : Tạo farm mới (mapped to `farmsApi.create()`)
- `PUT /farms/{farm_id}` : Cập nhật farm (mapped to `farmsApi.update()`)
- `DELETE /farms/{farm_id}` : Xóa farm và cascade các related entities (mapped to `farmsApi.delete()`)
- `GET /farms/{farm_id}/export` : Export config (mapped to `farmsApi.exportConfig()`)
- `POST /farms/{farm_id}/clone` : Clone farm (mapped to `farmsApi.clone()`)

**Zones**
- `GET /farms/{farm_id}/zones` : Lấy danh sách zones thuộc 1 farm (mapped to `zonesApi.getByFarm()`)
- `POST /zones` : Tạo zone mới (mapped to `zonesApi.create()`)
- `PUT /zones/{zone_id}` : Cập nhật zone (mapped to `zonesApi.update()`)
- `DELETE /zones/{zone_id}` : Xóa zone và cascade (mapped to `zonesApi.delete()`)

**Devices**
- `GET /farms/{farm_id}/devices` : Lấy danh sách devices thuộc 1 farm (mapped to `devicesApi.getByFarm()`)
- `POST /devices` : Tạo device mới (mapped to `devicesApi.create()`)
- `PUT /devices/{device_id}` : Cập nhật device (mapped to `devicesApi.update()`)
- `DELETE /devices/{device_id}` : Xóa device và cascade các related registers (mapped to `devicesApi.delete()`)

**Registers**
- `GET /devices/{device_id}/registers` : Lấy danh sách registers thuộc 1 device (mapped to `registersApi.getByDevice()`)
- `POST /registers` : Tạo register mới (mapped to `registersApi.create()`)
- `PUT /registers/{register_id}` : Cập nhật register (mapped to `registersApi.update()`)
- `DELETE /registers/{register_id}` : Xóa register (mapped to `registersApi.delete()`)

**Users & Farm-Users**
- `POST /auth/login` : Đăng nhập (mapped to `authApi.login()`)
- `GET /users` : Lấy danh sách users (mapped to `authApi.getUsers()`)
- `POST /farm-users` : Gán user vào farm (mapped to `farmUsersApi.create()`)

**System Health**
- `GET /health` : Infra liveness Postgres/InfluxDB/MQTT — không cần auth (mapped to `healthApi.getInfra()`)
- `GET /admin/edge-health?period=` : Fleet edge-health overview, **chỉ super_admin** (mapped to `healthApi.getFleetEdgeHealth()`)
- `GET /farms/{farm_id}/edge-health/history` : Time-series edge-health của 1 farm (mapped to `healthApi.getFarmEdgeHistory()`)

## Folder Structure
```
FarmUI-Admin/
├── src/
│   ├── api/             # Mock DB and Service APIs
│   ├── components/      # Reusable UI components
│   ├── layouts/         # Root wrapper layouts (Sidebar, etc)
│   ├── pages/           # Route-level components (Login, FarmsList, FarmDetail)
│   ├── types.ts         # Global TypeScript interfaces
│   ├── App.tsx          # Router configuration
│   ├── index.css        # Global variables and Blueprint theme classes
│   └── main.tsx         # React root
└── index.html
```
