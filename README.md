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

FarmUI-Admin communicates with the SmartFarm FastAPI backend. All endpoints are prefixed with `/admin`.

### Implemented APIs (Mapped to Frontend Services)

**Farms**
- `GET /admin/farms` : Lấy danh sách farms (mapped to `farmsApi.getAll()`)
- `GET /admin/farms/{farm_id}` : Lấy thông tin chi tiết 1 farm (mapped to `farmsApi.getById()`)
- `POST /admin/farms` : Tạo farm mới (mapped to `farmsApi.create()`)
- `PUT /admin/farms/{farm_id}` : Cập nhật farm (mapped to `farmsApi.update()`)
- `DELETE /admin/farms/{farm_id}` : Xóa farm và cascade các related modules (mapped to `farmsApi.delete()`)

**Modules**
- `GET /admin/farms/{farm_id}/modules` : Lấy danh sách modules thuộc 1 farm (mapped to `modulesApi.getByFarm()`)
- `POST /admin/modules` : Tạo module mới (mapped to `modulesApi.create()`)
- `PUT /admin/modules/{module_id}` : Cập nhật module (mapped to `modulesApi.update()`)
- `DELETE /admin/modules/{module_id}` : Xóa module và cascade các related registers (mapped to `modulesApi.delete()`)

**Registers**
- `GET /admin/modules/{module_id}/registers` : Lấy danh sách registers thuộc 1 module (mapped to `registersApi.getByModule()`)
- `POST /admin/registers` : Tạo register mới (mapped to `registersApi.create()`)
- `PUT /admin/registers/{register_id}` : Cập nhật register (mapped to `registersApi.update()`)
- `DELETE /admin/registers/{register_id}` : Xóa register (mapped to `registersApi.delete()`)

### APIs Pending Implementation

- `POST /admin/farms/{farm_id}/config` : Upload YAML config cho farm. (Endpoint này đã có trên Backend nhưng Frontend hiện tại chưa có UI hoặc Service function để upload file YAML).

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
