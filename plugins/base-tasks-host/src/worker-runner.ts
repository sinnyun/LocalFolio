import { Worker } from 'node:worker_threads'
import type { WorkerRunOptions } from '@folio/base-contract'

interface WorkerEnvelope {
  readonly type?: string
  readonly payload?: unknown
  readonly data?: unknown
  readonly message?: string
}

function createAbortError(message = 'Worker 任务已取消'): Error {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

export function runNodeWorker<TOutput = unknown, TInput = unknown>(
  options: WorkerRunOptions<TInput>,
): Promise<TOutput> {
  if (options.signal?.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise<TOutput>((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const worker = new Worker(options.workerPath, {
      workerData: options.input,
    })

    const cleanup = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort)
      }
    }

    const finishResolve = (data: TOutput): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(data)
    }

    const finishReject = (err: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const onAbort = (): void => {
      void worker.terminate()
      finishReject(createAbortError())
    }

    if (options.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        void worker.terminate()
        finishReject(new Error(`Worker 执行超时 (${options.timeoutMs}ms)`))
      }, options.timeoutMs)
      timeoutId.unref?.()
    }

    worker.on('message', (msg: WorkerEnvelope) => {
      if (settled || !msg || typeof msg !== 'object') return
      if (msg.type === 'progress') {
        options.onProgress?.(msg.payload)
        return
      }
      if (msg.type === 'result') {
        finishResolve(msg.data as TOutput)
        return
      }
      if (msg.type === 'error') {
        finishReject(new Error(msg.message || 'Worker 执行失败'))
      }
    })

    worker.on('error', err => {
      finishReject(err)
    })

    worker.on('exit', code => {
      if (settled) return
      if (code === 0) {
        finishReject(new Error('Worker 正常退出但未返回结果'))
      } else {
        finishReject(new Error(`Worker 异常退出 (code=${code})`))
      }
    })
  })
}
