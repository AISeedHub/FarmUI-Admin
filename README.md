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

## Development Guide

### Mock Database
The application operates entirely offline right now using a simulated backend located in `src/api/mockDb.ts`. 

- **Data Persistence**: Any changes (Modules created, Farm names changed, etc.) are saved to your browser's `localStorage`.
- **Resetting Data**: To restore the factory default mock data, clear your browser's Local Storage for the site, or remove the `farms`, `modules`, and `registers` keys specifically.

### Preparing for Real Backend Integration
The `src/api/services.ts` file acts as the bridge. Currently, it triggers `delay()` functions and reads from `mockDb.ts`. 
To connect this frontend to a real API:
1. Open `src/api/services.ts`.
2. Remove the `delay()` logic and the `import { mockDb }` statement.
3. Replace the function bodies with standard `fetch()` or `axios()` calls directed perfectly matching the provided Endpoints.
   *Example:*
   ```ts
   export const farmsApi = {
     getAll: async () => {
       const res = await fetch('/api/farms');
       return res.json();
     },
     // ...
   }
   ```

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
