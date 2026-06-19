---
id: getting-started
title: Getting started
sidebar_label: Getting started
description: Set up and run FarmUI-Admin locally.
---

# Getting started

Run **FarmUI-Admin** locally against the FarmBE backend.

## Prerequisites

- Node.js v18+ (recommended)
- npm or yarn
- A running FarmBE backend (or the built-in mock service layer for offline UI work)

## Install

```bash
git clone https://github.com/AISeedHub/FarmUI-Admin.git
cd FarmUI-Admin
npm install
```

## Configure the backend

The backend base URL is read from the `VITE_API_BASE_URL` environment variable
(`import.meta.env.VITE_API_BASE_URL`). Set it in a `.env` file at the repo root:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

If the variable is empty in local dev, requests fall back to the Vite proxy.
Every request except `POST /auth/login` attaches a bearer token taken from
`localStorage.getItem('access_token')`.

## Run

```bash
npm run dev
```

Open `http://localhost:5173` (or the port Vite reports). Default credentials:

- **Username:** `admin`
- **Password:** `admin`

:::tip
For the complete list of backend endpoints the UI calls, see the
[API usage](./api_usage.md) guide.
:::
