#!/usr/bin/env node
// Zero-dependency CDP screenshot helper for DSH instances (handles persistent SSE).
// Usage: node scripts/shot.mjs --url <url> --out screenshots/check.png [--wait 5000] [--click "<js>"] [--after 1200]

import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const url = arg('url')
const out = arg('out', 'screenshots/shot.png')
const waitMs = Number(arg('wait', '5000'))
const click = arg('click', null)
const afterMs = Number(arg('after', '1200'))
const port = Number(arg('port', '9224'))

if (!url) {
  console.error('missing --url')
  process.exit(2)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const chromePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find(p => existsSync(p))
if (!chromePath) {
  console.error('no chromium browser found; set CHROME_PATH')
  process.exit(2)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'lf-cdp-shot-'))
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1600,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`timeout: ${method}`))
    }, 20000)
    pending.set(id, { resolve, reject, timer })
  })
}

async function main() {
  let version
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) {
        version = await r.json()
        break
      }
    } catch {
      // wait for DevTools
    }
    await sleep(250)
  }
  if (!version) throw new Error('devtools endpoint never came up')

  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  const target = await created.json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  ws.addEventListener('message', ev => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.id === undefined) {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params?.exceptionDetails
        const text = d?.exception?.description || d?.text || ''
        console.log('PAGE EXCEPTION:', String(text).split('\n').slice(0, 6).join(' | '))
      } else if (
        msg.method === 'Runtime.consoleAPICalled' &&
        ['error', 'warning'].includes(msg.params?.type)
      ) {
        const text = (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ')
        console.log(`PAGE CONSOLE ${msg.params.type}:`, String(text).slice(0, 400))
      }
      return
    }
    const slot = pending.get(msg.id)
    if (!slot) return
    pending.delete(msg.id)
    clearTimeout(slot.timer)
    if (msg.error) slot.reject(new Error(`${msg.error.message} (${msg.error.code})`))
    else slot.resolve(msg.result)
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await sleep(waitMs)

  if (click) {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${click} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) throw new Error(`click threw: ${res.exceptionDetails.text}`)
    console.log('click result:', JSON.stringify(res.result?.value ?? null))
    await sleep(afterMs)
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`saved ${out}`)
  process.exitCode = 0
}

main()
  .catch(err => {
    console.error('shot failed:', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      ws?.close()
    } catch {
      // ignore
    }
    try {
      chrome.kill()
    } catch {
      // ignore
    }
    await sleep(300)
    process.exit(process.exitCode ?? 0)
  })
