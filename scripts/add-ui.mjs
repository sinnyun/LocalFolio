#!/usr/bin/env node
/**
 * Helper: `pnpm run ui:add <component-or-url>`
 * Runs `npx shadcn@latest add` inside `plugins/core-ui-kit` and immediately
 * runs `scripts/sync-ui-kit.mjs` to fix imports, strip global CSS, and update
 * barrel exports automatically.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const uiKitDir = path.join(repoRoot, 'plugins', 'core-ui-kit')
const targets = process.argv.slice(2)

if (targets.length === 0) {
  console.error('Usage: pnpm run ui:add <shadcn-component-or-url> [...]')
  process.exit(1)
}

const env = {
  ...process.env,
  pnpm_config_registry: process.env.pnpm_config_registry ?? 'https://registry.npmjs.org',
}

const npxArgs = ['--yes', 'shadcn@latest', 'add', ...targets, '--yes', '--overwrite']
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'npx', ...npxArgs], { cwd: uiKitDir, stdio: 'inherit', env })
} else {
  execFileSync('npx', npxArgs, { cwd: uiKitDir, stdio: 'inherit', env })
}

execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-ui-kit.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
})
