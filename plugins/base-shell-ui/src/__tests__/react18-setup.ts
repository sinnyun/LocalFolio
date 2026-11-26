import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const PINNED_MODULES: Record<string, string> = {
  react: path.join(repoRoot, 'node_modules/react/index.js'),
  'react/jsx-runtime': path.join(repoRoot, 'node_modules/react/jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(repoRoot, 'node_modules/react/jsx-dev-runtime.js'),
  'react-dom': path.join(repoRoot, 'node_modules/react-dom/index.js'),
  'react-dom/client': path.join(repoRoot, 'node_modules/react-dom/client.js'),
}

const mod = Module as unknown as {
  _resolveFilename: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string
}

const originalResolve = mod._resolveFilename
mod._resolveFilename = function patchedResolveFilename(
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
): string {
  const pinned = PINNED_MODULES[request]
  if (pinned) return pinned
  return originalResolve.call(this, request, parent, isMain, options)
}
