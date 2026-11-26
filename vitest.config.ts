import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'react/jsx-runtime': path.resolve(rootDir, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(rootDir, 'node_modules/react/jsx-dev-runtime.js'),
      'react-dom/client': path.resolve(rootDir, 'node_modules/react-dom/client.js'),
      'react-dom': path.resolve(rootDir, 'node_modules/react-dom/index.js'),
      react: path.resolve(rootDir, 'node_modules/react/index.js'),
      '@folio/base-ui-kit/client': path.resolve(rootDir, 'plugins/base-ui-kit/src/client.tsx'),
      '@folio/base-ui-kit': path.resolve(rootDir, 'plugins/base-ui-kit/src/client.tsx'),
      '@': path.resolve(rootDir, 'plugins/base-ui-kit/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['libs/*/src/**/*.test.{ts,tsx}', 'plugins/*/src/**/*.test.{ts,tsx}'],
    setupFiles: ['plugins/base-shell-ui/src/__tests__/react18-setup.ts'],
    environment: 'node',
    globals: false,
    server: {
      deps: {
        inline: [/zustand/, /react-resizable-panels/, /@radix-ui/, /lucide-react/],
      },
    },
  },
})
