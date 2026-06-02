import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// After the BE refactor every resource router sits at the root path.
// Proxy each top-level segment to the backend during local dev.
const BACKEND_TARGET = 'http://127.0.0.1:8000'

const apiPrefixes = [
  '/auth',
  '/users',
  '/farms',
  '/zones',
  '/devices',
  '/registers',
  '/farm-users',
  '/actuator-commands',
  '/automations',
  '/condition-groups',
  '/conditions',
  '/actions',
]

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      apiPrefixes.map((prefix) => [
        prefix,
        {
          target: BACKEND_TARGET,
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.accept?.includes('text/html')) {
              return '/index.html';
            }
          },
        },
      ])
    ),
  },
})
