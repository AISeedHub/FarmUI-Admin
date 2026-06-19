---
id: deep-dives-index
title: Deep dives
slug: /deep-dives
sidebar_label: Overview
description: Narrative explanations of FarmUI-Admin's core classes and flows.
---

# Deep dives

Hand-written (often AI-assisted) narrative that explains FarmUI-Admin's core
classes, services, and flows in detail — the "why" and "how" that auto-generated
reference can't capture. These are committed markdown, refreshed when a module
changes materially.

:::note Coming in a later phase
No deep dives have been written yet. Likely first pages include the API service
layer (`src/api/services.ts`), the Blueprint canvas, and the i18n setup.
:::

Each deep dive follows a fixed template:

```markdown
# <Module / Class name>

**Purpose** — one paragraph: what this exists to do.
**Responsibilities** — bullet list of what it owns.

## Key classes / functions
### `ClassName.method(args) -> Return`
Signature, plain-English explanation, when it's called, side effects, gotchas.

## Collaborators — what it depends on / what depends on it (with file links).
## Data flow — how data moves through it (Mermaid if useful).
## Gotchas & invariants — threading, ordering, error handling, edge cases.
## Example — a minimal real usage drawn from the codebase.
```

Add one page per major module and list them in `sidebars.ts`.
