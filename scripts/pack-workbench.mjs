import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const suiteDir = path.join(root, 'bundles', 'workbench-suite')
const output = path.join(root, 'dist', 'localfolio-workbench.tgz')

function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function copyPackageFiles(source, destination, files) {
  fs.mkdirSync(destination, { recursive: true })
  for (const file of files) {
    fs.cpSync(path.join(source, file), path.join(destination, file), { recursive: true })
  }
}

function copyCanvasAssets(source, destination) {
  const require = createRequire(path.join(source, 'package.json'))
  const assets = path.dirname(require.resolve('@tldraw/assets/package.json'))
  copyPackageFiles(assets, path.join(destination, 'lib', 'tldraw-assets'), [
    'embed-icons', 'fonts', 'icons', 'translations', 'LICENSE.md',
  ])
}

const staging = fs.mkdtempSync(path.join(tmpdir(), 'localfolio-workbench-'))
try {
  const packageDir = path.join(staging, 'package')
  const suite = readManifest(suiteDir)
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${suite.version}`) {
    throw new Error(`Release tag must match the workbench version (v${suite.version})`)
  }
  copyPackageFiles(suiteDir, packageDir, suite.files)

  const dependencies = {}
  for (const [name, spec] of Object.entries(suite.dependencies)) {
    if (!spec.startsWith('link:')) throw new Error(`Expected a local plugin for ${name}`)
    const source = path.resolve(suiteDir, spec.slice('link:'.length))
    const manifest = readManifest(source)
    if (manifest.name !== name) throw new Error(`Expected ${name} at ${source}, found ${manifest.name}`)
    const destination = path.join(packageDir, 'node_modules', name)
    for (const key of ['.', './client']) {
      const exported = manifest.exports[key]
      if (exported === undefined && key === './client') continue
      const entry = typeof exported === 'string' ? exported : exported?.default
      if (typeof entry !== 'string') throw new Error(`${name} must export a built entry for ${key}`)
      if (!fs.existsSync(path.join(source, entry))) {
        throw new Error(`Missing ${name} entry ${entry}. Run pnpm run build first.`)
      }
      // Type/source entries are for the monorepo; this archive contains runtime files.
      manifest.exports[key] = entry
    }
    copyPackageFiles(source, destination, manifest.files)
    if (name === '@folio/workspace-canvas-host') {
      copyCanvasAssets(source, destination)
      delete manifest.dependencies['@tldraw/assets']
    }
    if (Object.keys(manifest.dependencies ?? {}).length > 0) {
      throw new Error(`${name} has runtime dependencies that are not included in the workbench archive`)
    }
    delete manifest.dependencies
    delete manifest.devDependencies
    writeManifest(destination, manifest)
    dependencies[name] = manifest.version
  }
  writeManifest(packageDir, {
    ...suite,
    dependencies,
    bundledDependencies: Object.keys(dependencies),
  })

  const archive = path.join(staging, 'localfolio-workbench.tgz')
  execFileSync('tar', ['-czf', archive, '-C', staging, 'package'], { stdio: 'inherit' })
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.copyFileSync(archive, output)
  console.log(`Packed ${Object.keys(dependencies).length} plugins into ${output}`)
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}
