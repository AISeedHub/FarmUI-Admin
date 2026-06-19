import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/* =============================================================================
 * Per-repo documentation site template.
 *
 * ADAPT PER REPO — replace REPONAME with the GitHub repo name
 * (FarmBE | FarmLink | FarmSimulator | FarmUI-Dashboard | FarmUI-Admin), and set
 * SITE_URL / PORTAL_URL below to the matching Vercel (or custom) domains.
 * Everything else can stay as-is; the shared theme keeps all sites identical.
 *
 * Lives in the source repo's `website/` folder and deploys to that repo's OWN
 * Vercel project. One-time Vercel setup: create a project linked to this repo,
 * set its Root Directory = `website` (Framework: Docusaurus), and add the repo
 * Actions secrets VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID, then use
 * .github/workflows/vercel-deploy.yml. Served at the domain root → baseUrl '/'.
 * ===========================================================================*/
const REPO = 'FarmUI-Admin';
const SITE_URL = 'https://farmui-admin-docs.vercel.app';   // this repo's Vercel / custom domain
const PORTAL_URL = 'https://aiseed-farmdocs.vercel.app'; // Farm-Docs portal (update if custom domain set)

const config: Config = {
  title: REPO,
  tagline: 'Admin frontend — configuration & management console (TypeScript + React)',
  favicon: 'img/favicon.svg',

  url: SITE_URL,
  baseUrl: '/',

  organizationName: 'AISeedHub',
  projectName: REPO,
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  onBrokenAnchors: 'warn',

  markdown: {mermaid: true},
  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // Docs-only site: serve docs at the site root.
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: `https://github.com/AISeedHub/${REPO}/edit/main/website/`,
        },
        blog: false,
        theme: {
          // Shared "Verdant Terminal" theme — synced from Farm-Docs/shared/custom.css.
          // Do not hand-edit; re-sync from the Farm-Docs repo instead.
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
    navbar: {
      title: REPO,
      logo: {alt: REPO, src: 'img/logo.svg'},
      items: [
        {to: '/', label: 'Overview', position: 'left'},
        {to: '/guides', label: 'Guides', position: 'left'},
        {to: '/api-reference', label: 'API reference', position: 'left'},
        {to: '/deep-dives', label: 'Deep dives', position: 'left'},
        // Link back to the central portal.
        {href: PORTAL_URL, label: 'All services', position: 'right'},
        {href: `https://github.com/AISeedHub/${REPO}`, label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Overview', to: '/'},
            {label: 'Guides', to: '/guides'},
            {label: 'API reference', to: '/api-reference'},
            {label: 'Deep dives', to: '/deep-dives'},
          ],
        },
        {
          title: 'Platform',
          items: [
            {label: 'Farm-Docs portal', href: PORTAL_URL},
            {label: 'AISeedHub on GitHub', href: 'https://github.com/AISeedHub'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AISeedHub. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['python', 'bash', 'json', 'yaml', 'tsx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
