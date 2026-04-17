/**
 * NCC monorepo — full dev orchestrator (Windows-first).
 *
 * Starts in parallel (spawn, isolated failures):
 * - FastAPI backend (PowerShell + venv + uvicorn)
 * - Every first-level folder with package.json "scripts.dev" → npm run dev
 * - Stripe CLI webhook forwarder (if `stripe` is on PATH)
 *
 * Logs are prefixed: [backend], [driver], [operations], [portal], [saas], [stripe], …
 * Does not change Vite ports; warns on common “port in use” log patterns.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname)

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const MAGENTA = '\x1b[35m'

const PORT_CONFLICT_RE =
  /(EADDRINUSE|address already in use|Port\s+\d+\s+is\s+already\s+in\s+use|strictPort)/i

const BACKEND_IMPORT_ERR_RE =
  /(ModuleNotFoundError|No module named|ImportError:|cannot import name|Traceback \(most recent call last\))/i

const children = []
let backendHintPrinted = false

/** Detected Vite dev server port per repo folder (e.g. `driver-app` → 5174). */
const vitePortsByFolder = new Map()

/** Fallback when Vite has not yet printed `Local:` (matches typical repo defaults). */
const DEFAULT_FOLDER_PORT = new Map([
  ['driver-app', 5174],
  ['driver-dashboard', 5177],
  ['client-app', 5173],
  ['operations-dashboard', 5175],
  ['portal', 5178],
  ['admin-saas', 5176],
])

/** Dashboard rows: label → folder(s) that can supply a port (first detected wins). */
const UI_FRONTEND_ROWS = [
  { label: 'Driver', folders: ['driver-app', 'driver-dashboard'] },
  { label: 'Client', folders: ['client-app'] },
  { label: 'Operations', folders: ['operations-dashboard'] },
  { label: 'Portal', folders: ['portal'] },
  { label: 'SaaS Admin', folders: ['admin-saas'] },
]

let dashboardDebounceTimer = null

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Human-friendly log tag (matches requested examples where possible).
 * @param {string} folderName
 */
function logTag(folderName) {
  switch (folderName) {
    case 'backend':
      return 'backend'
    case 'driver-dashboard':
      return 'driver'
    case 'driver-app':
      return 'driver-app'
    case 'operations-dashboard':
      return 'operations'
    case 'portal':
      return 'portal'
    case 'admin-saas':
      return 'saas'
    case 'stripe-cli':
      return 'stripe'
    default:
      return folderName.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
  }
}

function maybeWarnPortConflict(tag, line) {
  if (!PORT_CONFLICT_RE.test(line)) return
  console.log(
    `${YELLOW}[${tag}] ⚠ Possible port conflict / bind error (Vite did not change ports).${RESET}`,
  )
  console.log(`${DIM}    ${line}${RESET}`)
}

/**
 * Parse Vite "Local:" / "Network:" lines (stdout or stderr).
 * @param {string} line
 * @returns {number | null}
 */
function tryExtractViteLocalPort(line) {
  const patterns = [
    /Local:\s*https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})\b/i,
    /Network:\s*https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})\b/i,
    // Markdown-wrapped links sometimes appear in copied logs
    /\(https?:\/\/localhost:(\d{2,5})\//i,
  ]
  for (const re of patterns) {
    const m = line.match(re)
    if (m) {
      const n = Number(m[1])
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

function portForFolder(folder) {
  if (vitePortsByFolder.has(folder)) return vitePortsByFolder.get(folder)
  if (DEFAULT_FOLDER_PORT.has(folder)) return DEFAULT_FOLDER_PORT.get(folder)
  return null
}

function resolvedPortForUiRow(row) {
  for (const f of row.folders) {
    const p = portForFolder(f)
    if (p != null) return p
  }
  return null
}

function recordVitePortFromLine(folderName, line) {
  if (!folderName || folderName === 'backend' || folderName === 'stripe-cli') return
  const port = tryExtractViteLocalPort(line)
  if (port == null) return
  const prev = vitePortsByFolder.get(folderName)
  if (prev === port) return
  vitePortsByFolder.set(folderName, port)
  scheduleDashboardRefresh()
}

function scheduleDashboardRefresh() {
  if (dashboardDebounceTimer) clearTimeout(dashboardDebounceTimer)
  dashboardDebounceTimer = setTimeout(() => {
    dashboardDebounceTimer = null
    printDynamicDashboard(' (URLs updated from Vite logs)')
  }, 320)
}

function maybeBackendDepsHint(tag, line) {
  if (tag !== 'backend' || backendHintPrinted) return
  if (!BACKEND_IMPORT_ERR_RE.test(line)) return
  backendHintPrinted = true
  console.log(
    `${CYAN}[backend] Tip:${RESET} missing Python deps? In backend venv run: ${GREEN}pip install -r requirements.txt${RESET}`,
  )
}

function pipeTagged(tag, stream, folderName) {
  if (!stream) return
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.length) continue
      recordVitePortFromLine(folderName, line)
      maybeWarnPortConflict(tag, line)
      maybeBackendDepsHint(tag, line)
      console.log(`${DIM}[${tag}]${RESET} ${line}`)
    }
  })
  stream.on('end', () => {
    if (buffer.length) {
      recordVitePortFromLine(folderName, buffer)
      maybeWarnPortConflict(tag, buffer)
      maybeBackendDepsHint(tag, buffer)
      console.log(`${DIM}[${tag}]${RESET} ${buffer}`)
    }
  })
}

function registerProcess(folderName, child) {
  const tag = logTag(folderName)
  pipeTagged(tag, child.stdout, folderName)
  pipeTagged(tag, child.stderr, folderName)
  child.on('error', (err) => {
    if (folderName === 'stripe-cli' && /ENOENT|spawn/.test(err.message)) {
      console.warn(
        `${YELLOW}[stripe] Stripe CLI not found on PATH.${RESET} Install: https://stripe.com/docs/stripe-cli`,
      )
      return
    }
    console.error(`${RED}[${tag}] spawn error:${RESET} ${err.message}`)
  })
  child.on('exit', (code, signal) => {
    const bad = code !== 0 && code !== null
    if (bad) {
      console.error(
        `${RED}[${tag}] stopped (code=${code}${signal ? ` signal=${signal}` : ''}).${RESET} Other processes keep running.`,
      )
      if (tag === 'backend') {
        console.error(
          `${CYAN}[backend] Tip:${RESET} activate venv, then ${GREEN}pip install -r requirements.txt${RESET} and retry.`,
        )
      }
    } else {
      console.log(`${DIM}[${tag}] exited (code=${code}).${RESET}`)
    }
  })
  children.push({ tag, folderName, child })
}

function startBackend() {
  const backendDir = path.join(ROOT, 'backend')
  if (!fs.existsSync(backendDir)) {
    console.warn(`${YELLOW}[backend] Skip: ./backend not found${RESET}`)
    return
  }

  if (process.platform !== 'win32') {
    const unixPy = path.join(backendDir, 'venv', 'bin', 'python')
    if (!fs.existsSync(unixPy)) {
      console.warn(`${YELLOW}[backend] Skip: venv not found at backend/venv/bin/python${RESET}`)
      return
    }
    const child = spawn(
      unixPy,
      ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
      { cwd: backendDir, stdio: ['inherit', 'pipe', 'pipe'], env: process.env },
    )
    registerProcess('backend', child)
    return
  }

  const activatePs1 = path.join(backendDir, 'venv', 'Scripts', 'Activate.ps1')
  if (!fs.existsSync(activatePs1)) {
    console.warn(`${YELLOW}[backend] Skip: ./backend/venv/Scripts/Activate.ps1 not found${RESET}`)
    return
  }

  const loc = backendDir.replace(/'/g, "''")
  const act = activatePs1.replace(/'/g, "''")
  const cmd = `Set-Location '${loc}'; . '${act}'; python -m uvicorn app.main:app --reload`

  console.log(`${CYAN}[backend]${RESET} Starting FastAPI (uvicorn)…`)
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
    cwd: backendDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    windowsHide: true,
  })
  registerProcess('backend', child)
}

function startStripeListen() {
  const forward = 'localhost:8000/api/payments/webhook'

  console.log(`${CYAN}[stripe]${RESET} Starting: stripe listen --forward-to ${forward}`)
  // Windows: Stripe CLI is resolved via PATH like a cmd script; shell avoids spawn EINVAL.
  // Keep stdout/stderr as pipes so [stripe] log prefixing still works (stdio: "inherit" would drop prefixes).
  const child = spawn(
    'stripe',
    ['listen', '--forward-to', forward],
    {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
    },
  )
  registerProcess('stripe-cli', child)
}

function startNpmDevApps() {
  const dirents = fs.readdirSync(ROOT, { withFileTypes: true })
  const dirs = dirents.filter((d) => d.isDirectory()).map((d) => d.name).sort()

  let count = 0
  for (const dirName of dirs) {
    if (dirName.startsWith('.')) continue
    if (dirName === 'node_modules') continue
    if (dirName === 'backend') continue

    const pkgPath = path.join(ROOT, dirName, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    const pkg = readJson(pkgPath)
    if (!pkg?.scripts?.dev) continue

    const tag = logTag(dirName)
    console.log(`${GREEN}[${tag}]${RESET} Starting npm run dev in ./${dirName}`)

    // Windows: npm is a cmd script; spawn without shell often fails with EINVAL.
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npmCmd, ['run', 'dev'], {
      cwd: path.join(ROOT, dirName),
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    registerProcess(dirName, child)
    count += 1
  }
  return count
}

function printDynamicDashboard(titleSuffix = '') {
  console.log(`\n${DIM}---${RESET}`)
  console.log(`${GREEN}## 🚀 NCC SYSTEM READY${titleSuffix}${RESET}\n`)
  console.log(`${CYAN}Backend:     http://localhost:8000${RESET}`)
  console.log(`${CYAN}Admin:       http://localhost:8000/admin${RESET}`)
  console.log('')
  for (const row of UI_FRONTEND_ROWS) {
    const p = resolvedPortForUiRow(row)
    const url = p != null ? `http://localhost:${p}` : 'http://localhost:?'
    const label = `${row.label}:`.padEnd(13)
    console.log(`${GREEN}${label}${RESET} ${GREEN}${url}${RESET}`)
  }
  console.log('')
  console.log(`${MAGENTA}Stripe:      listening → webhook active${RESET}`)
  console.log(`${DIM}---${RESET}\n`)
}

/** Windows bonus: open driver app + API docs (non-blocking). */
/** Non-blocking: after ~2.5s GET /docs to see if uvicorn is accepting connections. */
function scheduleBackendHealthCheck() {
  setTimeout(() => {
    const url = 'http://localhost:8000/docs'
    const req = http.get(url, { timeout: 6000 }, (res) => {
      res.resume()
      if (res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300) {
        console.log('\n✅ Backend ready')
      } else {
        console.log('\n❌ Backend not responding')
      }
    })
    req.on('error', () => {
      console.log('\n❌ Backend not responding')
    })
    req.on('timeout', () => {
      req.destroy()
      console.log('\n❌ Backend not responding')
    })
  }, 2500)
}

function openBonusBrowsers() {
  if (process.platform !== 'win32') return
  const driverRow = UI_FRONTEND_ROWS.find((r) => r.label === 'Driver')
  const driverPort = driverRow ? resolvedPortForUiRow(driverRow) : 5174
  const urls = [`http://localhost:${driverPort ?? 5174}`, 'http://localhost:8000/docs']
  for (const url of urls) {
    spawn('cmd', ['/c', 'start', '', url], {
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
    }).unref?.()
  }
}

function shutdown() {
  console.log(`\n${YELLOW}Stopping all child processes…${RESET}`)
  for (const { child } of children) {
    try {
      if (child.pid && process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else if (child.pid) {
        child.kill('SIGTERM')
      }
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 400)
}

function main() {
  console.log(`${DIM}ncc dev orchestrator — root:${RESET}`, ROOT)
  console.log(
    `${DIM}Ports are not modified here; watch logs for Vite “port in use” / strictPort messages.${RESET}\n`,
  )

  startBackend()
  const n = startNpmDevApps()
  startStripeListen()

  console.log(
    `\n${CYAN}Launched:${RESET} backend + ${n} frontend(s) + stripe listener (if CLI available). ${DIM}Ctrl+C stops all.${RESET}\n`,
  )

  setTimeout(() => {
    printDynamicDashboard('')
    openBonusBrowsers()
  }, 600)

  scheduleBackendHealthCheck()

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
