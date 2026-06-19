---
id: guides-index
title: Guides
slug: /guides
sidebar_label: Overview
description: Task-oriented how-tos for FarmUI-Admin.
---

# Guides

Task-oriented how-tos for working with **FarmUI-Admin**, the admin
configuration console. Start with **Getting started** to run the app locally,
then use the **API usage** reference when wiring the frontend to the FarmBE
backend.

| Guide | When to read |
| --- | --- |
| [Getting started](./getting-started.md) | First run: install, configure the backend base URL, and log in. |
| [API usage](./api_usage.md) | The full list of backend endpoints the Admin UI consumes — method, path, request body, and response types per resource, plus the request/response data models. |

## Authoritative sources

- **Endpoint paths + body shapes:** the FarmBE backend's live OpenAPI (Swagger
  `/docs`, ReDoc `/redoc`) is generated from the FastAPI routes, so it always
  matches the running backend. When this site's [API usage](./api_usage.md) guide
  and Swagger disagree, **Swagger is correct**.
- **Frontend service definitions:** the API calls themselves are defined in
  `src/api/services.ts`, and the request/response TypeScript models in
  `src/types.ts`.
