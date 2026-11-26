import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import readline from 'node:readline'

export interface ShellThumbOptions {
  readonly allowIconFallback?: boolean
  readonly signal?: AbortSignal
}

export interface ShellThumbProvider {
  getThumbnail(
    filePath: string,
    size: number,
    options?: ShellThumbOptions,
  ): Promise<Buffer | null>
  dispose(): void
}

const SIIGBF_BIGGERSIZEOK = 0x00000001
const SIIGBF_THUMBNAILONLY = 0x00000008

const MAX_WORKERS = 2
const REQUEST_TIMEOUT_MS = 6000
const IDLE_SHUTDOWN_MS = 60_000

const PS_INIT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions

$cs = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class LfWinShellThumb {
  [StructLayout(LayoutKind.Sequential)]
  public struct SIZE { public int cx; public int cy; }

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

  public static string GetPngBase64(string path, int size, int flags) {
    Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
    IShellItemImageFactory factory = null;
    int hr = SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
    if (hr != 0 || factory == null) {
      return null;
    }
    IntPtr hbm = IntPtr.Zero;
    try {
      SIZE sz = new SIZE { cx = size, cy = size };
      hr = factory.GetImage(sz, flags, out hbm);
      if (hr != 0 || hbm == IntPtr.Zero) {
        return null;
      }

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
        int lines = GetDIBits(hdc, hbm, 0, (uint)h, pixels, ref bmi, 0);
        if (lines == 0) {
          return null;
        }
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
}
'@
Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = 33554432

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
    $s = [int]$req['size']
    $f = [int]$req['flags']
    $b64 = [LfWinShellThumb]::GetPngBase64($p, $s, $f)
    if ($null -eq $b64) {
      [Console]::Out.WriteLine($ser.Serialize(@{ id = $id; ok = $false; code = 'no_thumb' }))
    } else {
      [Console]::Out.WriteLine($ser.Serialize(@{ id = $id; ok = $true; b64 = $b64 }))
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
  readonly code?: string
}

interface PendingJob {
  readonly id: number
  readonly filePath: string
  readonly size: number
  readonly flags: number
  readonly resolve: (buf: Buffer | null) => void
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

export function createNoopShellThumbProvider(): ShellThumbProvider {
  return {
    async getThumbnail() {
      return null
    },
    dispose() {},
  }
}

export function createWindowsShellThumbProvider(): ShellThumbProvider {
  if (process.platform !== 'win32') {
    return createNoopShellThumbProvider()
  }

  let disposed = false
  let nextId = 1
  const workers: WorkerInstance[] = []
  const queue: PendingJob[] = []

  const finishJob = (job: PendingJob, buf: Buffer | null): void => {
    if (job.signal && job.onAbort) {
      job.signal.removeEventListener('abort', job.onAbort)
    }
    job.resolve(buf)
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

  const pumpQueue = (): void => {
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
      size: job.size,
      flags: job.flags,
    })
    try {
      worker.proc.stdin.write(`${payload}\n`)
    } catch {
      destroyWorker(worker)
      pumpQueue()
    }
  }

  const spawnWorker = (): WorkerInstance => {
    const encoded = Buffer.from(PS_INIT_SCRIPT, 'utf16le').toString('base64')
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
        finishJob(active.job, Buffer.from(msg.b64, 'base64'))
      } else {
        finishJob(active.job, null)
      }
      scheduleIdleReap(worker)
      pumpQueue()
    })

    proc.on('exit', () => {
      destroyWorker(worker)
      pumpQueue()
    })
    proc.on('error', () => {
      destroyWorker(worker)
      pumpQueue()
    })

    return worker
  }

  return {
    getThumbnail(filePath: string, size: number, options: ShellThumbOptions = {}): Promise<Buffer | null> {
      if (disposed || options.signal?.aborted) {
        return Promise.resolve(null)
      }
      const clampedSize = Math.max(32, Math.min(512, Math.round(size)))
      const flags = options.allowIconFallback
        ? SIIGBF_BIGGERSIZEOK
        : SIIGBF_BIGGERSIZEOK | SIIGBF_THUMBNAILONLY

      return new Promise<Buffer | null>(resolve => {
        const id = nextId++
        const job: PendingJob = {
          id,
          filePath,
          size: clampedSize,
          flags,
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
