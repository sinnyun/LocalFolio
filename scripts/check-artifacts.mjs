#!/usr/bin/env node
/**
 * Syntax-checks every generated `lib/index.js` and `lib/client.js` across `plugins/*`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = path.join(repoRoot, 'plugins')

let checked = 0
for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const libDir = path.join(pluginsDir, entry.name, 'lib')
  for (const file of ['index.js', 'client.js']) {
    const full = path.join(libDir, file)
    if (!fs.existsSync(full)) continue
    execFileSync(process.execPath, ['--check', full], { stdio: 'inherit' })
    checked += 1
  }
}

if (checked === 0) {
  console.error('No built plugin artifacts found to check.')
  process.exit(1)
}
console.log(`node --check passed on ${checked} plugin artifacts.`)
