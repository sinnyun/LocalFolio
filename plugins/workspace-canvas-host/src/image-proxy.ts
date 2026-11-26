import { spawn, type ChildProcessByStdio } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { FolioError, type FolioRouteHandler } from '@folio/base-contract'
import { classifyImageFile, normalizeLocalPath } from './image-meta.js'
import type { CanvasCacheStats } from './types.js'

export const LOD_TIERS = [256, 512, 1024, 2048] as const
export type LodTier = (typeof LOD_TIERS)[number]

export const MAX_CACHE_BYTES = 256 * 1024 * 1024 // 256 MB
export const MAX_CACHE_FILES = 1500
const MAX_SVG_STREAM_BYTES = 2 * 1024 * 1024 // 2 MB

const MAX_WORKERS = 2
const REQUEST_TIMEOUT_MS = 12_000
const IDLE_SHUTDOWN_MS = 60_000

const ALPHA_EXTS = new Set(['.png', '.webp', '.gif', '.ico', '.svg'])

export function snapLodTier(rawPx: number): LodTier {
  const safe = Number.isFinite(rawPx) ? rawPx : 512
  const clamped = Math.max(64, Math.min(2048, Math.round(safe)))
  for (const tier of LOD_TIERS) {
    if (clamped <= tier) return tier
  }
  return 2048
}

export interface ImageProxyOptions {
  readonly preferPng?: boolean
  readonly signal?: AbortSignal
}

export interface ImageProxyResult {
  readonly buffer: Buffer
  readonly mime: 'image/jpeg' | 'image/png' | 'image/svg+xml'
}

export interface ImageProxyProvider {
  renderProxy(
    filePath: string,
    tier: number,
    options?: ImageProxyOptions,
  ): Promise<ImageProxyResult | null>
  dispose(): void
}

const PS_WIC_INIT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Xaml
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions

$cs = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Media.Imaging;

public static class LfCanvasWicProxy {
  [StructLayout(LayoutKind.Sequential)]
  struct SIZE { public int cx; public int cy; }

  [ComImport]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
  interface IShellItemImageFactory {
    [PreserveSig]
    int GetImage([In] SIZE size, [In] int flags, out IntPtr phbm);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
  static extern int SHCreateItemFromParsingName(
    [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
    IntPtr pbc,
    ref Guid riid,
    out IShellItemImageFactory ppv);

  [DllImport("gdi32.dll")]
  static extern bool DeleteObject(IntPtr hObject);

  [StructLayout(LayoutKind.Sequential)]
  struct BITMAP {
    public int bmType;
    public int bmWidth;
    public int bmHeight;
    public int bmWidthBytes;
    public ushort bmPlanes;
    public ushort bmBitsPixel;
    public IntPtr bmBits;
  }

  [DllImport("gdi32.dll", EntryPoint = "GetObjectW")]
  static extern int GetObject(IntPtr hgdiobj, int cbBuffer, out BITMAP lpvObject);

  [StructLayout(LayoutKind.Sequential)]
  struct BITMAPINFOHEADER {
    public uint biSize;
    public int biWidth;
    public int biHeight;
    public ushort biPlanes;
    public ushort biBitCount;
    public uint biCompression;
    public uint biSizeImage;
    public int biXPelsPerMeter;
    public int biYPelsPerMeter;
    public uint biClrUsed;
    public uint biClrImportant;
  }

  [DllImport("user32.dll")]
  static extern IntPtr GetDC(IntPtr hWnd);

  [DllImport("user32.dll")]
  static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

  [DllImport("gdi32.dll")]
  static extern int GetDIBits(
    IntPtr hdc,
    IntPtr hbm,
    uint start,
    uint cLines,
    [Out] byte[] lpvBits,
    ref BITMAPINFOHEADER lpbmi,
    uint usage);

  static string TryWicDecode(string path, int tier, bool preferPng, out string mime) {
    mime = preferPng ? "image/png" : "image/jpeg";
    try {
      int srcW = 0;
      int srcH = 0;
      using (var probeStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
        var decoder = BitmapDecoder.Create(
          probeStream,
          BitmapCreateOptions.IgnoreColorProfile,
          BitmapCacheOption.OnDemand);
        if (decoder == null || decoder.Frames.Count == 0) return null;
        var frame = decoder.Frames[0];
        srcW = frame.PixelWidth;
        srcH = frame.PixelHeight;
      }

      if (srcW <= 0 || srcH <= 0) return null;
      int maxDim = Math.Max(srcW, srcH);
      int targetMax = Math.Min(tier, maxDim);

      var bi = new BitmapImage();
      using (var decodeStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
        bi.BeginInit();
        bi.StreamSource = decodeStream;
        bi.CacheOption = BitmapCacheOption.OnLoad;
        bi.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
        if (srcW >= srcH) {
          bi.DecodePixelWidth = Math.Max(1, targetMax);
        } else {
          bi.DecodePixelHeight = Math.Max(1, targetMax);
        }
        bi.EndInit();
      }
      bi.Freeze();

      BitmapEncoder encoder;
      if (preferPng) {
        encoder = new PngBitmapEncoder();
        mime = "image/png";
      } else {
        var jpeg = new JpegBitmapEncoder();
        jpeg.QualityLevel = 85;
        encoder = jpeg;
        mime = "image/jpeg";
      }
      encoder.Frames.Add(BitmapFrame.Create(bi));
      using (var ms = new MemoryStream()) {
        encoder.Save(ms);
        return Convert.ToBase64String(ms.ToArray());
      }
    } catch {
      return null;
    }
  }

  static string TryShellFallback(string path, int tier, out string mime) {
    mime = "image/png";
    Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
    IShellItemImageFactory factory = null;
    int hr = SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
    if (hr != 0 || factory == null) return null;

    IntPtr hbm = IntPtr.Zero;
    try {
      int size = Math.Max(64, Math.Min(512, tier));
      SIZE sz = new SIZE { cx = size, cy = size };
      // SIIGBF_BIGGERSIZEOK (1) | SIIGBF_THUMBNAILONLY (8)
      hr = factory.GetImage(sz, 9, out hbm);
      if (hr != 0 || hbm == IntPtr.Zero) return null;

      BITMAP bm;
      if (GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), out bm) == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0) {
        return null;
      }

      int w = bm.bmWidth;
      int h = bm.bmHeight;
      byte[] pixels = new byte[w * h * 4];
      var bmi = new BITMAPINFOHEADER {
        biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER)),
        biWidth = w,
        biHeight = -h,
        biPlanes = 1,
        biBitCount = 32,
        biCompression = 0
      };

      IntPtr hdc = GetDC(IntPtr.Zero);
      try {
        if (GetDIBits(hdc, hbm, 0, (uint)h, pixels, ref bmi, 0) == 0) return null;
      } finally {
        ReleaseDC(IntPtr.Zero, hdc);
      }

      bool hasAlpha = false;
      for (int i = 3; i < pixels.Length; i += 4) {
        if (pixels[i] != 0) {
          hasAlpha = true;
          break;
        }
      }

      PixelFormat fmt = hasAlpha ? PixelFormat.Format32bppPArgb : PixelFormat.Format32bppRgb;
      using (var bmp = new Bitmap(w, h, fmt)) {
        var rect = new Rectangle(0, 0, w, h);
        var data = bmp.LockBits(rect, ImageLockMode.WriteOnly, fmt);
        try {
          int stride = data.Stride;
          int rowBytes = w * 4;
          if (stride == rowBytes) {
            Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
          } else {
            for (int y = 0; y < h; y++) {
              Marshal.Copy(pixels, y * rowBytes, IntPtr.Add(data.Scan0, y * stride), rowBytes);
            }
          }
        } finally {
          bmp.UnlockBits(data);
        }
        using (var ms = new MemoryStream()) {
          bmp.Save(ms, ImageFormat.Png);
          return Convert.ToBase64String(ms.ToArray());
        }
      }
    } finally {
      if (hbm != IntPtr.Zero) DeleteObject(hbm);
      if (factory != null) Marshal.ReleaseComObject(factory);
    }
  }

  public static string[] RenderProxy(string path, int tier, bool preferPng) {
    string mime;
    string b64 = TryWicDecode(path, tier, preferPng, out mime);
    if (b64 != null) return new string[] { b64, mime };
    b64 = TryShellFallback(path, tier, out mime);
    if (b64 != null) return new string[] { b64, mime };
    return null;
  }
}
'@
Add-Type -TypeDefinition $cs -ReferencedAssemblies PresentationCore, WindowsBase, System.Xaml, System.Drawing
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = 67108864

[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = 0
  try {
    $req = $ser.DeserializeObject($line)
    $id = [int]$req['id']
    $p = [string]$req['path']
    $t = [int]$req['tier']
    $png = [bool]$req['preferPng']
    $res = [LfCanvasWicProxy]::RenderProxy($p, $t, $png)
    if ($null -eq $res) {
      [Console]::Out.WriteLine($ser.Serialize(@{ id = $id; ok = $false; code = 'decode_failed' }))
    } else {
      [Console]::Out.WriteLine($ser.Serialize(@{ id = $id; ok = $true; b64 = $res[0]; mime = $res[1] }))
    }
  } catch {
    [Console]::Out.WriteLine($ser.Serialize(@{ id = $id; ok = $false; code = 'error' }))
  }
  [Console]::Out.Flush()
}
`

interface WorkerResponse {
  readonly ready?: boolean
  readonly id?: number
  readonly ok?: boolean
  readonly b64?: string
  readonly mime?: string
}

interface PendingJob {
  readonly id: number
  readonly filePath: string
  readonly tier: number
  readonly preferPng: boolean
  readonly resolve: (res: ImageProxyResult | null) => void
  readonly signal?: AbortSignal
  readonly onAbort?: () => void
}

interface WorkerInstance {
  readonly proc: ChildProcessByStdio<Writable, Readable, null>
  readonly rl: readline.Interface
  ready: boolean
  busy: boolean
  activeJob: {
    readonly job: PendingJob
    readonly timer: ReturnType<typeof setTimeout>
  } | null
  idleTimer: ReturnType<typeof setTimeout> | null
  disposed: boolean
}

export function createNoopImageProxyProvider(): ImageProxyProvider {
  return {
    async renderProxy() {
      return null
    },
    dispose() {},
  }
}

export function createWindowsWicImageProxyProvider(): ImageProxyProvider {
  if (process.platform !== 'win32') {
    return createNoopImageProxyProvider()
  }

  let disposed = false
  let nextId = 1
  let consecutiveStartupFailures = 0
  const workers: WorkerInstance[] = []
  const queue: PendingJob[] = []

  const finishJob = (job: PendingJob, res: ImageProxyResult | null): void => {
    if (job.signal && job.onAbort) {
      job.signal.removeEventListener('abort', job.onAbort)
    }
    job.resolve(res)
  }

  const destroyWorker = (worker: WorkerInstance): void => {
    if (worker.disposed) return
    worker.disposed = true
    if (worker.idleTimer) {
      clearTimeout(worker.idleTimer)
      worker.idleTimer = null
    }
    if (worker.activeJob) {
      clearTimeout(worker.activeJob.timer)
      const active = worker.activeJob.job
      worker.activeJob = null
      finishJob(active, null)
    }
    const idx = workers.indexOf(worker)
    if (idx >= 0) workers.splice(idx, 1)
    try {
      worker.rl.close()
    } catch {
      // ignore
    }
    try {
      worker.proc.kill()
    } catch {
      // ignore
    }
  }

  const scheduleIdleReap = (worker: WorkerInstance): void => {
    if (worker.idleTimer) clearTimeout(worker.idleTimer)
    worker.idleTimer = setTimeout(() => {
      if (!worker.busy && !worker.activeJob) {
        destroyWorker(worker)
      }
    }, IDLE_SHUTDOWN_MS)
    worker.idleTimer.unref?.()
  }

  const dispatchToWorker = (worker: WorkerInstance, job: PendingJob): void => {
    if (worker.idleTimer) {
      clearTimeout(worker.idleTimer)
      worker.idleTimer = null
    }
    worker.busy = true
    const timer = setTimeout(() => {
      destroyWorker(worker)
      pumpQueue()
    }, REQUEST_TIMEOUT_MS)
    timer.unref?.()
    worker.activeJob = { job, timer }

    const payload = JSON.stringify({
      id: job.id,
      path: job.filePath,
      tier: job.tier,
      preferPng: job.preferPng,
    })
    try {
      worker.proc.stdin.write(`${payload}\n`)
    } catch {
      destroyWorker(worker)
      pumpQueue()
    }
  }

  const spawnWorker = (): WorkerInstance => {
    const encoded = Buffer.from(PS_WIC_INIT_SCRIPT, 'utf16le').toString('base64')
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
      {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      },
    )
    proc.unref?.()

    const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity })
    const worker: WorkerInstance = {
      proc,
      rl,
      ready: false,
      busy: false,
      activeJob: null,
      idleTimer: null,
      disposed: false,
    }
    workers.push(worker)

    rl.on('line', line => {
      if (worker.disposed) return
      let msg: WorkerResponse
      try {
        msg = JSON.parse(line) as WorkerResponse
      } catch {
        return
      }
      if (msg.ready) {
        consecutiveStartupFailures = 0
        worker.ready = true
        scheduleIdleReap(worker)
        pumpQueue()
        return
      }
      const active = worker.activeJob
      if (!active || msg.id !== active.job.id) return
      clearTimeout(active.timer)
      worker.activeJob = null
      worker.busy = false

      if (msg.ok && typeof msg.b64 === 'string' && msg.b64.length > 0) {
        const mime = msg.mime === 'image/png' ? 'image/png' : 'image/jpeg'
        finishJob(active.job, {
          buffer: Buffer.from(msg.b64, 'base64'),
          mime,
        })
      } else {
        finishJob(active.job, null)
      }
      scheduleIdleReap(worker)
      pumpQueue()
    })

    const onPrematureExit = () => {
      const failedBeforeReady = !worker.disposed && !worker.ready
      destroyWorker(worker)
      if (failedBeforeReady) {
        consecutiveStartupFailures += 1
        if (consecutiveStartupFailures >= 2) {
          while (queue.length > 0) {
            const job = queue.shift()!
            finishJob(job, null)
          }
          return
        }
      }
      pumpQueue()
    }

    proc.on('exit', onPrematureExit)
    proc.on('error', onPrematureExit)

    return worker
  }

  function pumpQueue(): void {
    if (disposed) return
    while (queue.length > 0) {
      const idle = workers.find(w => !w.disposed && w.ready && !w.busy)
      if (idle) {
        const job = queue.shift()!
        if (job.signal?.aborted) {
          finishJob(job, null)
          continue
        }
        dispatchToWorker(idle, job)
        continue
      }
      if (workers.length < MAX_WORKERS) {
        spawnWorker()
      }
      break
    }
  }

  return {
    renderProxy(
      filePath: string,
      tier: number,
      options: ImageProxyOptions = {},
    ): Promise<ImageProxyResult | null> {
      if (disposed || options.signal?.aborted) {
        return Promise.resolve(null)
      }
      const snapped = snapLodTier(tier)
      const preferPng = Boolean(options.preferPng)

      return new Promise<ImageProxyResult | null>(resolve => {
        const id = nextId++
        const job: PendingJob = {
          id,
          filePath,
          tier: snapped,
          preferPng,
          resolve,
          signal: options.signal,
          onAbort: () => {
            const qIdx = queue.indexOf(job)
            if (qIdx >= 0) {
              queue.splice(qIdx, 1)
              finishJob(job, null)
            }
          },
        }
        if (options.signal && job.onAbort) {
          options.signal.addEventListener('abort', job.onAbort, { once: true })
        }
        queue.push(job)
        pumpQueue()
      })
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      while (queue.length > 0) {
        const job = queue.shift()!
        finishJob(job, null)
      }
      for (const worker of [...workers]) {
        destroyWorker(worker)
      }
    },
  }
}

function getLodDir(cacheDir: string): string {
  return path.join(cacheDir, 'lod')
}

function cacheKeyHash(filePath: string, size: number, mtimeMs: number, tier: LodTier): string {
  return crypto
    .createHash('sha256')
    .update(`${filePath.toLowerCase()}|${size}|${Math.trunc(mtimeMs)}|${tier}`)
    .digest('hex')
}

async function pruneLodCacheIfNeeded(lodDir: string): Promise<void> {
  let names: string[]
  try {
    names = await fsp.readdir(lodDir)
  } catch {
    return
  }

  const files: Array<{ fullPath: string; size: number; atimeMs: number }> = []
  let totalBytes = 0

  for (const name of names) {
    if (!name.endsWith('.jpg') && !name.endsWith('.png')) continue
    const fullPath = path.join(lodDir, name)
    try {
      const st = await fsp.stat(fullPath)
      if (!st.isFile()) continue
      totalBytes += st.size
      files.push({ fullPath, size: st.size, atimeMs: st.atimeMs || st.mtimeMs })
    } catch {
      // ignore concurrent unlink
    }
  }

  if (files.length <= MAX_CACHE_FILES && totalBytes <= MAX_CACHE_BYTES) {
    return
  }

  files.sort((a, b) => a.atimeMs - b.atimeMs)
  let remainingFiles = files.length
  let remainingBytes = totalBytes

  for (const file of files) {
    if (remainingFiles <= MAX_CACHE_FILES && remainingBytes <= MAX_CACHE_BYTES) break
    await fsp.unlink(file.fullPath).catch(() => {})
    remainingFiles -= 1
    remainingBytes -= file.size
  }
}

export async function getLodCacheStats(cacheDir: string): Promise<CanvasCacheStats> {
  const lodDir = getLodDir(cacheDir)
  let fileCount = 0
  let totalBytes = 0
  try {
    const names = await fsp.readdir(lodDir)
    for (const name of names) {
      if (!name.endsWith('.jpg') && !name.endsWith('.png')) continue
      try {
        const st = await fsp.stat(path.join(lodDir, name))
        if (st.isFile()) {
          fileCount += 1
          totalBytes += st.size
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // lod dir may not exist yet
  }

  return {
    fileCount,
    totalBytes,
    maxBytes: MAX_CACHE_BYTES,
    maxFiles: MAX_CACHE_FILES,
    tiers: [...LOD_TIERS],
  }
}

export async function clearLodCache(cacheDir: string): Promise<CanvasCacheStats> {
  const lodDir = getLodDir(cacheDir)
  try {
    await fsp.rm(lodDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
  await fsp.mkdir(lodDir, { recursive: true }).catch(() => {})
  return getLodCacheStats(cacheDir)
}

export interface CanvasProxyRouteOptions {
  readonly cacheDir: string
  readonly provider: ImageProxyProvider
}

export function createCanvasProxyRouteHandler(
  options: CanvasProxyRouteOptions,
): FolioRouteHandler {
  const lodDir = getLodDir(options.cacheDir)
  const inflight = new Map<string, Promise<ImageProxyResult | null>>()
  let pruneScheduled = false

  const schedulePrune = (): void => {
    if (pruneScheduled) return
    pruneScheduled = true
    setTimeout(() => {
      pruneScheduled = false
      void pruneLodCacheIfNeeded(lodDir)
    }, 500).unref?.()
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }

    const filePath = normalizeLocalPath(rawPath)
    let st: fs.Stats
    try {
      st = await fsp.stat(filePath)
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'link_missing', message: `链接图片不存在或已被移动: ${filePath}` },
        }),
        {
          status: 404,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-folio-link-status': 'missing',
            'cache-control': 'no-store',
          },
        },
      )
    }

    if (!st.isFile()) {
      throw new FolioError('not_a_file', '目标路径不是有效图片文件', 400)
    }

    const classified = classifyImageFile(path.basename(filePath))
    if (!classified.isImage) {
      throw new FolioError('unsupported_media', `不支持的图片格式: ${classified.ext}`, 415)
    }

    const rawTier = Number(url.searchParams.get('tier') ?? '512')
    const tier = snapLodTier(rawTier)
    const etag = `"lod-${st.size}-${Math.trunc(st.mtimeMs)}-${tier}"`

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'private, max-age=31536000, immutable',
          'x-folio-lod-tier': String(tier),
          'x-folio-link-status': 'ok',
        },
      })
    }

    // Serve lightweight SVG directly with sandbox CSP
    if (classified.ext === '.svg' && st.size <= MAX_SVG_STREAM_BYTES) {
      const svgBuffer = await fsp.readFile(filePath)
      return new Response(new Uint8Array(svgBuffer), {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml',
          'content-length': String(svgBuffer.length),
          'content-security-policy': 'sandbox',
          etag,
          'cache-control': 'private, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'x-folio-lod-tier': String(tier),
          'x-folio-link-status': 'ok',
        },
      })
    }

    const hash = cacheKeyHash(filePath, st.size, st.mtimeMs, tier)
    const jpgPath = path.join(lodDir, `${hash}.jpg`)
    const pngPath = path.join(lodDir, `${hash}.png`)

    for (const candidate of [
      { path: jpgPath, mime: 'image/jpeg' as const },
      { path: pngPath, mime: 'image/png' as const },
    ]) {
      try {
        const cached = await fsp.readFile(candidate.path)
        if (cached.length > 0) {
          return new Response(new Uint8Array(cached), {
            status: 200,
            headers: {
              'content-type': candidate.mime,
              'content-length': String(cached.length),
              etag,
              'cache-control': 'private, max-age=31536000, immutable',
              'x-content-type-options': 'nosniff',
              'x-folio-lod-tier': String(tier),
              'x-folio-link-status': 'ok',
            },
          })
        }
      } catch {
        // cache miss
      }
    }

    const preferPng = ALPHA_EXTS.has(classified.ext)
    let pending = inflight.get(hash)
    if (!pending) {
      pending = (async () => {
        const rendered = await options.provider.renderProxy(filePath, tier, { preferPng })
        if (!rendered || rendered.buffer.length === 0) return null
        await fsp.mkdir(lodDir, { recursive: true })
        const ext = rendered.mime === 'image/png' ? 'png' : 'jpg'
        const target = path.join(lodDir, `${hash}.${ext}`)
        const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
        try {
          await fsp.writeFile(tmp, rendered.buffer)
          await fsp.rename(tmp, target)
          schedulePrune()
        } catch {
          await fsp.unlink(tmp).catch(() => {})
        }
        return rendered
      })().finally(() => {
        inflight.delete(hash)
      })
      inflight.set(hash, pending)
    }

    const rendered = await pending
    if (!rendered) {
      throw new FolioError('proxy_render_failed', `无法生成图片代理缩略图: ${filePath}`, 500)
    }

    return new Response(new Uint8Array(rendered.buffer), {
      status: 200,
      headers: {
        'content-type': rendered.mime,
        'content-length': String(rendered.buffer.length),
        etag,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'x-folio-lod-tier': String(tier),
        'x-folio-link-status': 'ok',
      },
    })
  }
}
