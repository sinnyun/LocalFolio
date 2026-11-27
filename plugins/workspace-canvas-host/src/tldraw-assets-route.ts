import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FolioError, type FolioRouteHandler } from '@folio/base-contract'

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
}

function resolveDefaultTldrawAssetsRoot(): string {
  const packagedAssets = fileURLToPath(new URL('./tldraw-assets/', import.meta.url))
  if (existsSync(packagedAssets)) return packagedAssets
  const require = createRequire(import.meta.url)
  const pkgPath = require.resolve('@tldraw/assets/package.json')
  return path.dirname(pkgPath)
}

export function createTldrawAssetRouteHandler(assetsRootDir?: string): FolioRouteHandler {
  const rootDir = path.resolve(assetsRootDir ?? resolveDefaultTldrawAssetsRoot())

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const rel = url.searchParams.get('f')
    if (!rel) {
      throw new FolioError('missing_asset_path', '缺少静态资源路径参数 f', 400)
    }

    if (rel.includes('\0') || path.isAbsolute(rel)) {
      throw new FolioError('forbidden_asset_path', '非法的静态资源路径', 403)
    }

    const normalizedRel = rel.replace(/\\/g, '/').replace(/^\/+/, '')
    if (
      normalizedRel.split('/').some(seg => seg === '..' || seg === '')
    ) {
      throw new FolioError('forbidden_asset_path', '不允许越界访问静态资源路径', 403)
    }

    const fullPath = path.resolve(rootDir, normalizedRel)
    const relativeToRoot = path.relative(rootDir, fullPath)
    if (
      relativeToRoot.startsWith('..') ||
      path.isAbsolute(relativeToRoot)
    ) {
      throw new FolioError('forbidden_asset_path', '静态资源路径越界', 403)
    }

    let data: Buffer
    try {
      const st = await fsp.stat(fullPath)
      if (!st.isFile()) {
        throw new FolioError('not_found', `静态资源不存在: ${normalizedRel}`, 404)
      }
      data = await fsp.readFile(fullPath)
    } catch (err) {
      if (err instanceof FolioError) throw err
      throw new FolioError('not_found', `静态资源不存在: ${normalizedRel}`, 404)
    }

    const ext = path.extname(fullPath).toLowerCase()
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'content-type': mime,
        'content-length': String(data.length),
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  }
}
