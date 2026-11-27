import { spawn, type ChildProcessByStdio } from 'node:child_process'
import readline from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type {
  NativeImageProxyOptions,
  NativeImageProxyResult,
  NativeThumbOptions,
} from '@folio/base-contract'

const MAX_WORKERS = 4
const REQUEST_TIMEOUT_MS = 10_000
const IDLE_SHUTDOWN_MS = 60_000

const SIIGBF_BIGGERSIZEOK = 0x00000001
const SIIGBF_THUMBNAILONLY = 0x00000008

export interface NativeMediaPool {
  getThumbnail(
    filePath: string,
    size: number,
    options?: NativeThumbOptions,
  ): Promise<NativeImageProxyResult | null>
  renderImageProxy(
    filePath: string,
    maxDim: number,
    options?: NativeImageProxyOptions,
  ): Promise<NativeImageProxyResult | null>
  dispose(): void
}

const PS_MEDIA_POOL_SCRIPT = String.raw`
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

public static class LfBaseNativeMedia {
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

  static ImageCodecInfo FindJpegEncoder() {
    var codecs = ImageCodecInfo.GetImageEncoders();
    for (int i = 0; i < codecs.Length; i++) {
      if (codecs[i].FormatID == ImageFormat.Jpeg.Guid) return codecs[i];
    }
    return null;
  }

  static string EncodeBitmap(Bitmap bmp, bool usePng, out string mime) {
    using (var ms = new MemoryStream()) {
      if (usePng) {
        bmp.Save(ms, ImageFormat.Png);
        mime = "image/png";
      } else {
        var jpegCodec = FindJpegEncoder();
        if (jpegCodec != null) {
          using (var ep = new EncoderParameters(1)) {
            ep.Param[0] = new EncoderParameter(Encoder.Quality, 82L);
            bmp.Save(ms, jpegCodec, ep);
          }
          mime = "image/jpeg";
        } else {
          bmp.Save(ms, ImageFormat.Png);
          mime = "image/png";
        }
      }
      return Convert.ToBase64String(ms.ToArray());
    }
  }

  static string TryShellThumb(string path, int size, int flags, bool preferPng, out string mime) {
    mime = "image/png";
    Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
    IShellItemImageFactory factory = null;
    int hr = SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
    if (hr != 0 || factory == null) return null;

    IntPtr hbm = IntPtr.Zero;
    try {
      int clamped = Math.Max(32, Math.Min(512, size));
      SIZE sz = new SIZE { cx = clamped, cy = clamped };
      hr = factory.GetImage(sz, flags, out hbm);
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
      bool hasNonOpaqueAlpha = false;
      for (int i = 3; i < pixels.Length; i += 4) {
        byte a = pixels[i];
        if (a != 0) hasAlpha = true;
        if (a != 255) hasNonOpaqueAlpha = true;
        if (hasAlpha && hasNonOpaqueAlpha) break;
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

        bool usePng = preferPng || (hasAlpha && hasNonOpaqueAlpha);
        return EncodeBitmap(bmp, usePng, out mime);
      }
    } finally {
      if (hbm != IntPtr.Zero) DeleteObject(hbm);
      if (factory != null) Marshal.ReleaseComObject(factory);
    }
  }

  static string TryWicDecode(string path, int maxDim, bool preferPng, out string mime) {
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
      int largest = Math.Max(srcW, srcH);
      int targetMax = Math.Min(maxDim, largest);

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
        jpeg.QualityLevel = 82;
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

  public static string[] Execute(string mode, string path, int size, int flags, bool preferPng) {
    string mime;
    string b64 = null;
    if (mode == "wic-only") {
      b64 = TryWicDecode(path, size, preferPng, out mime);
      if (b64 != null) return new string[] { b64, mime };
      return null;
    }
    if (mode == "wic") {
      b64 = TryWicDecode(path, size, preferPng, out mime);
      if (b64 != null) return new string[] { b64, mime };
      b64 = TryShellThumb(path, size, flags, preferPng, out mime);
      if (b64 != null) return new string[] { b64, mime };
      return null;
    }
    b64 = TryShellThumb(path, size, flags, preferPng, out mime);
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
    $mode = [string]$req['mode']
    $p = [string]$req['path']
    $s = [int]$req['size']
    $f = [int]$req['flags']
    $png = [bool]$req['preferPng']
    $res = [LfBaseNativeMedia]::Execute($mode, $p, $s, $f, $png)
    if ($null -eq $res) {
      [Console]::Out.WriteLine($ser.Serialize(@{ id = $id; ok = $false; code = 'no_media' }))
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
  readonly mode: 'thumb' | 'wic' | 'wic-only'
  readonly filePath: string
  readonly size: number
  readonly flags: number
  readonly preferPng: boolean
  readonly resolve: (res: NativeImageProxyResult | null) => void
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

export function createNoopNativeMediaPool(): NativeMediaPool {
  return {
    async getThumbnail() {
      return null
    },
    async renderImageProxy() {
      return null
    },
    dispose() {},
  }
}

export function createWindowsNativeMediaPool(): NativeMediaPool {
  if (process.platform !== 'win32') {
    return createNoopNativeMediaPool()
  }

  let disposed = false
  let nextId = 1
  let consecutiveStartupFailures = 0
  const workers: WorkerInstance[] = []
  const queue: PendingJob[] = []

  const finishJob = (job: PendingJob, res: NativeImageProxyResult | null): void => {
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
      mode: job.mode,
      path: job.filePath,
      size: job.size,
      flags: job.flags,
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
    const encoded = Buffer.from(PS_MEDIA_POOL_SCRIPT, 'utf16le').toString('base64')
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

    const onPrematureExit = (): void => {
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

  const enqueue = (
    mode: 'thumb' | 'wic' | 'wic-only',
    filePath: string,
    size: number,
    flags: number,
    preferPng: boolean,
    signal?: AbortSignal,
  ): Promise<NativeImageProxyResult | null> => {
    if (disposed || signal?.aborted) {
      return Promise.resolve(null)
    }

    return new Promise<NativeImageProxyResult | null>(resolve => {
      const id = nextId++
      const job: PendingJob = {
        id,
        mode,
        filePath,
        size,
        flags,
        preferPng,
        resolve,
        signal,
        onAbort: () => {
          const idx = queue.indexOf(job)
          if (idx >= 0) {
            queue.splice(idx, 1)
            finishJob(job, null)
          }
        },
      }
      if (signal && job.onAbort) {
        signal.addEventListener('abort', job.onAbort, { once: true })
      }
      queue.push(job)
      pumpQueue()
    })
  }

  return {
    getThumbnail(
      filePath: string,
      size: number,
      options: NativeThumbOptions = {},
    ): Promise<NativeImageProxyResult | null> {
      const clampedSize = Math.max(32, Math.min(512, Math.round(size)))
      const flags = options.allowIconFallback
        ? SIIGBF_BIGGERSIZEOK
        : SIIGBF_BIGGERSIZEOK | SIIGBF_THUMBNAILONLY
      return enqueue('thumb', filePath, clampedSize, flags, Boolean(options.preferPng), options.signal)
    },

    renderImageProxy(
      filePath: string,
      maxDim: number,
      options: NativeImageProxyOptions = {},
    ): Promise<NativeImageProxyResult | null> {
      const clampedDim = Math.max(64, Math.min(2048, Math.round(maxDim)))
      const flags = SIIGBF_BIGGERSIZEOK | SIIGBF_THUMBNAILONLY
      const mode = options.strictWicOnly ? 'wic-only' : 'wic'
      return enqueue(mode, filePath, clampedDim, flags, Boolean(options.preferPng), options.signal)
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
