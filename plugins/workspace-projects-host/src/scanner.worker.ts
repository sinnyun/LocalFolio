import { parentPort, workerData } from 'node:worker_threads'
import { checkProjectChanges, scanProjectDirectory } from './scanner-core.js'
import type { ProjectManifest } from './types.js'

type ScannerWorkerInput =
  | {
      readonly op: 'scan-project'
      readonly projectPath: string
      readonly existingManifest?: ProjectManifest | null
      readonly supportedThumbExts?: readonly string[]
    }
  | {
      readonly op: 'check-changes'
      readonly projectPath: string
      readonly manifest: ProjectManifest
    }

async function main(): Promise<void> {
  const input = workerData as ScannerWorkerInput
  if (!input || typeof input !== 'object') {
    parentPort?.postMessage({ type: 'error', message: '无效的扫描 Worker 参数' })
    return
  }

  if (input.op === 'scan-project') {
    const result = await scanProjectDirectory(
      input.projectPath,
      input.existingManifest,
      progress => {
        parentPort?.postMessage({ type: 'progress', payload: progress })
      },
      { supportedThumbExts: input.supportedThumbExts },
    )
    parentPort?.postMessage({ type: 'result', data: result })
    return
  }

  if (input.op === 'check-changes') {
    const result = await checkProjectChanges(input.projectPath, input.manifest)
    parentPort?.postMessage({ type: 'result', data: result })
    return
  }

  parentPort?.postMessage({ type: 'error', message: '未知扫描 Worker 操作' })
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  parentPort?.postMessage({ type: 'error', message })
})
