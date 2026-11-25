#!/usr/bin/env node
/**
 * Unified Monorepo builder for all independent DSH plugins under `plugins/*`.
 *
 * Everything builds natively against DSH's frozen browser PLATFORM_MODULES:
 *   react, react-dom, @deepseek-ai/cordis, zod, @tanstack/react-virtual.
 * Shared UI components live in the standalone `@folio/core-ui-kit` plugin
 * (Radix UI + lucide-react + `.lf-*` theme tokens) and are consumed by other
 * UI plugins via `dsh.client.external` with zero duplication.
 * No Shadow DOM wall, no per-plugin Tailwind compilation, tiny plugin bundles.
 */

import esbuild from 'esbuild'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = path.join(repoRoot, 'plugins')
const watchMode = process.argv.includes('--watch')

const DSH_CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/*',
  '@deepseek-ai/*',
  'zod',
  '@tanstack/react-virtual',
]

function discoverPlugins() {
  if (!fs.existsSync(pluginsDir)) return []
  return fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(pluginsDir, d.name)
      const pkgPath = path.join(dir, 'package.json')
      if (!fs.existsSync(pkgPath)) return null
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const srcDir = path.join(dir, 'src')
      const hostEntry = path.join(srcDir, 'host.ts')
      const clientEntry = path.join(srcDir, 'client.tsx')
      const tailwindInput = path.join(srcDir, 'tailwind.css')
      const tailwindOutput = path.join(srcDir, 'tailwind.generated.css')
      const declaredExternals = Array.isArray(pkg.dsh?.client?.external)
        ? pkg.dsh.client.external
        : []
      return {
        folder: d.name,
        dir,
        name: pkg.name,
        srcDir,
        outDir: path.join(dir, 'lib'),
        hasHost: fs.existsSync(hostEntry),
        hasClient: fs.existsSync(clientEntry),
        hasTailwind: fs.existsSync(tailwindInput),
        tailwindInput,
        tailwindOutput,
        hostEntry,
        clientEntry,
        clientExternals: Array.from(new Set([...DSH_CLIENT_EXTERNALS, ...declaredExternals])),
      }
    })
    .filter(Boolean)
}

function indent(code) {
  return code
    .split('\n')
    .map(line => (line.length === 0 ? line : `\t\t${line}`))
    .join('\n')
}

function wrapClientBundle(pkgName, code) {
  return [
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(pkgName)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    indent(code).replace(/\n+$/, ''),
    '\t\treturn module.exports;',
    '\t},',
    '});',
    '',
  ].join('\n')
}

function writeAtomic(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const tmpPath = `${targetPath}.tmp`
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, targetPath)
}

function hostOptions(plugin) {
  return {
    entryPoints: [plugin.hostEntry],
    outfile: path.join(plugin.outDir, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    legalComments: 'none',
    banner: {
      js: [
        "import { createRequire as __lfCreateRequire } from 'node:module';",
        "import { fileURLToPath as __lfFileURLToPath } from 'node:url';",
        "import { dirname as __lfDirname } from 'node:path';",
        'const require = __lfCreateRequire(import.meta.url);',
        'const __filename = __lfFileURLToPath(import.meta.url);',
        'const __dirname = __lfDirname(__filename);',
      ].join(' '),
    },
    external: ['@deepseek-ai/*'],
  }
}

function compileTailwind(plugin) {
  if (!plugin.hasTailwind) return
  const binName = process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss'
  const candidates = [
    path.join(plugin.dir, 'node_modules', '.bin', binName),
    path.join(repoRoot, 'node_modules', '.bin', binName),
  ]
  const bin = candidates.find(p => fs.existsSync(p))
  if (!bin) {
    throw new Error(`tailwindcss CLI not found for ${plugin.name}; run pnpm install first`)
  }
  const args = ['-i', plugin.tailwindInput, '-o', plugin.tailwindOutput, '--minify']
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/c', bin, ...args], { cwd: plugin.dir, stdio: 'pipe' })
  } else {
    execFileSync(bin, args, { cwd: plugin.dir, stdio: 'pipe' })
  }
}

function clientOptions(plugin, onWrite) {
  return {
    entryPoints: [plugin.clientEntry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    legalComments: 'none',
    loader: {
      '.css': 'text',
    },
    alias: {
      '@': plugin.srcDir,
    },
    external: plugin.clientExternals,
    plugins: [
      {
        name: `write-wrapped-client:${plugin.folder}`,
        setup(build) {
          build.onStart(() => {
            if (plugin.hasTailwind) compileTailwind(plugin)
          })
          build.onEnd(result => {
            if (result.errors.length > 0 || !result.outputFiles?.[0]) return
            const wrapped = wrapClientBundle(plugin.name, result.outputFiles[0].text)
            writeAtomic(path.join(plugin.outDir, 'client.js'), wrapped)
            onWrite?.()
          })
        },
      },
    ],
  }
}

const plugins = discoverPlugins()
if (plugins.length === 0) {
  console.error('No plugins found under plugins/*')
  process.exit(1)
}

// Keep @folio/core-ui-kit barrel exports in sync before building
execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-ui-kit.mjs')], {
  cwd: repoRoot,
  stdio: 'pipe',
})

const watchContexts = []
let tailwindOwnerCtx = null

for (const plugin of plugins) {
  fs.mkdirSync(plugin.outDir, { recursive: true })

  if (plugin.hasHost) {
    if (watchMode) {
      watchContexts.push(await esbuild.context(hostOptions(plugin)))
    } else {
      await esbuild.build(hostOptions(plugin))
    }
  } else if (plugin.hasClient) {
    writeAtomic(
      path.join(plugin.outDir, 'index.js'),
      '// Browser-only DSH plugin host loader stub.\nexport function apply() {}\n',
    )
  }

  if (plugin.hasClient) {
    if (watchMode) {
      const ctx = await esbuild.context(
        clientOptions(plugin, () => {
          console.log(`[${new Date().toLocaleTimeString()}] rebuilt ${plugin.name} -> lib/client.js`)
          // When any business/shell UI plugin rebuilds, refresh the shared Tailwind stylesheet in core-ui-kit
          if (!plugin.hasTailwind && tailwindOwnerCtx) {
            void tailwindOwnerCtx.rebuild()
          }
        }),
      )
      if (plugin.hasTailwind) tailwindOwnerCtx = ctx
      watchContexts.push(ctx)
    } else {
      await esbuild.build(clientOptions(plugin))
    }
  }
}

if (watchMode) {
  await Promise.all(watchContexts.map(ctx => ctx.watch()))
  console.log(`watching ${plugins.length} plugins under plugins/*...`)
} else {
  const summary = plugins
    .map(p => {
      const parts = []
      if (p.hasHost) parts.push('host')
      if (p.hasClient) {
        const sizeKb = (fs.statSync(path.join(p.outDir, 'client.js')).size / 1024).toFixed(1)
        parts.push(`client:${sizeKb}KB`)
      }
      return `${p.name} [${parts.join('+')}]`
    })
    .join('\n  - ')
  console.log(`built ${plugins.length} DSH plugins:\n  - ${summary}`)
}
