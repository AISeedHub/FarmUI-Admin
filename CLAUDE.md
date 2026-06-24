# FarmUI-Admin — Documentation (`docs` branch)

This working tree is **FarmUI-Admin's documentation site**, on the long-lived **`docs`
branch**. Work on docs only. The React/TypeScript app code at the repo root is a *stale
snapshot* (the app is developed + deployed from `main`) and the docs build ignores it. Part
of the **Farm-Docs** system — portal: https://aiseed-farmdocs.vercel.app

## Current state (docs)
- **Live:** https://aiseed-farmdocs-admin.vercel.app  — Vercel docs project `farmdocs-admin`.
- **Deploy:** every push to `docs` runs `.github/workflows/vercel-deploy.yml`
  (`vercel deploy --prod`); the **root `vercel.json`** builds `website/` with `cleanUrls`.
- **Access:** Basic Auth — Vercel env `DOCS_USER` / `DOCS_PASSWORD` (root `middleware.ts`).
- **Content** (`website/docs/`):
  - `overview.md` (slug `/`) — from README (admin frontend: configuration & management console).
  - `guides/` — imported `API_USAGE.md` + a getting-started + guides index.
  - `api-reference/` + `deep-dives/` — **placeholders**.

## 🚨 CRITICAL — separate Vercel project & secret
This repo **also deploys the admin APP to Vercel from `main`** (e.g. `aiseed-smartfarm-admin.vercel.app`).
The docs deploy uses a **separate secret — `VERCEL_DOC_PROJECT_ID`** (the `farmdocs-admin` project),
not the app's `VERCEL_PROJECT_ID`, so a docs deploy never overwrites the live app. The
`vercel-deploy.yml` here is already wired to `secrets.VERCEL_DOC_PROJECT_ID` — keep it.
(Note: when first set up, this secret had a stray newline causing `Project not found`; if a
deploy fails that way, re-paste `VERCEL_DOC_PROJECT_ID` with no trailing whitespace.)

## Update workflow
1. `git fetch origin && git merge --ff-only origin/docs`
2. Edit Markdown under `website/docs/`.
3. `npm --prefix website install` → `npm --prefix website run build` to verify.
4. `git add … && git commit && git push origin docs` → Vercel (docs project) redeploys.

## Conventions & gotchas
- Node 18 → Docusaurus pinned **3.5.2** + `overrides.webpack 5.97.1`. Don't bump.
- `website/src/css/custom.css` = copy of the shared theme (`Farm-Docs/shared/custom.css`); re-sync.
- Imported guides keep `format: md`; `overview.md` uses `slug: /`.
- Mermaid: no reserved keywords (`Link`, `end`) as node ids; no `\n` in flowchart labels.
- `onBrokenLinks` / `onBrokenAnchors` = `warn`.

## Recreate this worktree
`git -C <FarmUI-Admin repo> worktree add ../FarmUI-Admin-docs docs`  → open Claude there.
