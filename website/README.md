# Per-repo docs site template

A minimal Docusaurus (TypeScript) starter that a **source repo** drops into its
own `website/` folder. It is pre-wired to the shared **Verdant Terminal** theme
and deploys to that repo's **own** GitHub Pages
(`https://aiseedhub.github.io/<repo>/`), so every service site looks identical to
the central portal.

## What's inside

```
repo-site/
├── docusaurus.config.ts     # site config (replace REPONAME)
├── sidebars.ts              # 4 standard sections
├── package.json             # pinned to Docusaurus 3.5.2 (Node 18+)
├── tsconfig.json
├── src/css/custom.css       # synced from Farm-Docs/shared/custom.css — do not edit
├── static/img/              # logo.svg, favicon.svg
└── docs/
    ├── overview.md          # served at "/"
    ├── guides/              # task-oriented how-tos
    ├── api-reference/       # auto-generated (TypeDoc / pydoc / OpenAPI)
    └── deep-dives/          # narrative explanations of core code
```

## How to adopt it in a source repo

1. **Copy** this folder into the source repo as `website/`:

   ```bash
   cp -r Farm-Docs/templates/repo-site <source-repo>/website
   ```

2. **Replace `REPONAME`** everywhere with the GitHub repo name
   (`FarmBE`, `FarmLink`, `FarmSimulator`, `FarmUI-Dashboard`, or `FarmUI-Admin`).
   It appears in `docusaurus.config.ts` (the `REPO` constant), `package.json`
   (`name`/`description`), and the placeholder docs.

3. **Sync the theme.** `src/css/custom.css` here is already a generated copy of
   `Farm-Docs/shared/custom.css`. Keep it current by re-running the Farm-Docs
   sync script against this folder whenever the shared theme changes:

   ```bash
   node Farm-Docs/scripts/sync-theme.mjs <source-repo>/website
   ```

   (See `Farm-Docs/shared/README.md` for copy vs. symlink vs. package options.)

4. **Add the CI workflow.** Copy
   `Farm-Docs/templates/github-actions/docs.yml` into the source repo at
   `.github/workflows/docs.yml`. It builds `website/` and deploys to the repo's
   GitHub Pages. Uncomment the pre-build generator step for the repo's stack
   (pydoc-markdown for Python repos, TypeDoc for FarmUI-Admin).

5. **Enable GitHub Pages** for the repo: Settings → Pages → Source = "GitHub
   Actions".

6. **Fill in content.** Replace the placeholder pages, wire the API-reference
   generator, and add deep-dive pages (one per major module).

## Develop locally

```bash
cd website
npm install
npm run start      # http://localhost:3000/<repo>/
npm run build
```

> Requires Node.js 18+. Pinned to Docusaurus **3.5.2** (last 3.x line supporting
> Node 18). Bump to the latest 3.x once on Node 20.
