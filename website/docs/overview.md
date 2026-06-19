---
id: overview
title: Overview
slug: /
sidebar_position: 1
description: What FarmUI-Admin is and where it sits in the AISeedHub Farm platform.
---

# FarmUI-Admin

**FarmUI-Admin** is the admin frontend for the AISeedHub Farm platform — a
configuration and management console for "Smartfarm" deployments. It provides a
visual, "Blueprint Style" interface to configure Farms, their interconnected
Zones and Devices, and the underlying hardware Registers, plus the users,
automation rules, and notification channels that drive the platform.

## Features

- **Blueprint aesthetics** — a data-driven, technical interface with dark slate
  backgrounds, graph-paper patterns, and neon blue/orange accents.
- **Bilingual support** — built-in English (EN) and Korean (KO) localization via
  `react-i18next`.
- **Farm overview** — create, view, update, and toggle the active status of
  multiple Smartfarms.
- **Visual "Blueprint" canvas** — a node-based interactive view of the
  relationships between a parent Farm, its connected Devices, and their
  Registers.
- **Configuration management** — Zones, Devices, Registers, Users and
  farm-membership roles, Automation scenes, and Notification channels/templates,
  all managed against the backend REST API.

## Tech stack

- **Framework:** React 18
- **Build tool:** Vite
- **Language:** TypeScript
- **Styling:** Vanilla CSS (CSS variables, flex/grid layouts)
- **Routing:** React Router DOM (v6)
- **i18n:** react-i18next
- **Icons:** Lucide React

## Role in the platform

FarmUI-Admin is one of the two web clients in the platform. It talks to the
**FarmBE** FastAPI backend over its REST API to read and write configuration
(farms, zones, devices, registers, users, automations, notifications). After the
backend's 3-tier refactor, endpoints live at the **root** by resource (no
`/admin` prefix); auth actions stay under `/auth`. For the cross-service picture,
see the [System architecture](https://aiseedhub.github.io/Farm-Docs/docs/system/architecture)
on the central portal.

## Quick start

### Prerequisites

- Node.js v18+ (recommended)
- npm or yarn

### Install & run

```bash
git clone https://github.com/AISeedHub/FarmUI-Admin.git
cd FarmUI-Admin
npm install
npm run dev
```

Open `http://localhost:5173` (or the port Vite reports) in your browser.

**Default login credentials:**

- **Username:** `admin`
- **Password:** `admin`

The base URL of the backend is read from `VITE_API_BASE_URL`. When empty in local
dev, requests go through the Vite proxy.

## Folder structure

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

## Documentation map

- **[Guides](/guides)** — task-oriented how-tos, including the full
  [API usage reference](/guides/api_usage) the frontend relies on.
- **[API reference](/api-reference)** — generated from source (TypeDoc), once wired.
- **[Deep dives](/deep-dives)** — narrative explanations of core classes and flows.
