'use strict'

/**
 * Native window for the locally installed DeepSeek Harness.
 * The shell owns the host process: it starts `dsh web --no-open` on a fixed
 * port, reads the authenticated URL from the CLI output and loads it into an
 * Electron window. No browser chrome, no extensions, no proxy, separate session.
 */

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron')
const { spawn } = require('node:child_process')
const { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const HOST = '127.0.0.1'
const PORT = 3080
const START_TIMEOUT_MS = 90_000
const HOST_LINE = /dsh web:\s+(\S+)/
const APP_NAME = 'DeepSeek Harness'
const ZOOM_FILE = 'zoom.json'
const ZOOM_STEP = 0.5
const ZOOM_MIN = -5
const ZOOM_MAX = 5

let hostProcess = null
let mainWindow = null
let shuttingDown = false

/** First executable file with this name on PATH. */
function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir === '') continue
    const candidate = path.join(dir, name)
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch { /* not here */ }
  }
  return undefined
}

/** Newest `@deepseek-ai/dsh` CLI inside the npx cache, if any. */
function newestNpxCli() {
  const root = path.join(os.homedir(), '.npm', '_npx')
  let best
  try {
    for (const entry of readdirSync(root)) {
      const bin = path.join(root, entry, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      if (!existsSync(bin)) continue
      const mtime = statSync(bin).mtimeMs
      if (best === undefined || mtime > best.mtime) best = { bin, mtime }
    }
  } catch { /* no npx cache */ }
  return best === undefined ? undefined : best.bin
}

/** Locate the installed CLI entry point. */
function resolveDsh() {
  const explicit = process.env.DSH_DESKTOP_BIN
  if (explicit !== undefined && existsSync(explicit)) {
    return explicit.endsWith('.js') ? { bin: explicit } : { launcher: explicit }
  }
  const launcher = findOnPath('dsh')
  if (launcher !== undefined) {
    try {
      const real = realpathSync(launcher)
      if (real.endsWith('.js')) return { bin: real }
    } catch { /* keep the launcher */ }
    return { launcher }
  }
  const cached = newestNpxCli()
  return cached === undefined ? undefined : { bin: cached }
}

/** Node used to run the CLI; Electron's own Node is the last resort. */
function resolveNode() {
  const explicit = process.env.DSH_DESKTOP_NODE
  if (explicit !== undefined && existsSync(explicit)) return explicit
  return findOnPath('node')
}

/** Persisted zoom level; Electron's level is log1.2 of the zoom factor. */
function readZoomLevel() {
  try {
    const saved = JSON.parse(readFileSync(path.join(app.getPath('userData'), ZOOM_FILE), 'utf8'))
    const level = Number(saved.level)
    if (Number.isFinite(level)) return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level))
  } catch { /* first launch */ }
  return 0
}

function saveZoomLevel(level) {
  try {
    writeFileSync(path.join(app.getPath('userData'), ZOOM_FILE), JSON.stringify({ level }), 'utf8')
  } catch { /* a read-only user data directory only loses persistence */ }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => { server.close(() => resolve(true)) })
    server.listen(port, HOST)
  })
}

/**
 * Start the host and resolve the authenticated URL it prints on readiness.
 * @returns {Promise<string>} URL containing this process's launch token.
 */
function startHost() {
  const resolved = resolveDsh()
  if (resolved === undefined) {
    return Promise.reject(new Error(
      'Не найден установленный dsh. Установите его (npm i -g @deepseek-ai/dsh) '
      + 'или задайте путь в переменной DSH_DESKTOP_BIN.',
    ))
  }
  const node = resolveNode()
  const env = { ...process.env }
  let command
  let args
  if (resolved.bin !== undefined) {
    if (node !== undefined) {
      command = node
      args = [resolved.bin, 'web', '--host', HOST, '--port', String(PORT), '--no-open']
    } else {
      command = process.execPath
      env.ELECTRON_RUN_AS_NODE = '1'
      args = [resolved.bin, 'web', '--host', HOST, '--port', String(PORT), '--no-open']
    }
  } else {
    command = resolved.launcher
    args = ['web', '--host', HOST, '--port', String(PORT), '--no-open']
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: os.homedir(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    hostProcess = child

    let output = ''
    let stderr = ''
    let settled = false
    const finish = (error, url) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error === undefined) resolve(url)
      else reject(error)
    }
    const timer = setTimeout(() => {
      finish(new Error(`Хост не сообщил адрес за ${START_TIMEOUT_MS / 1000} с. ${stderr.slice(-500)}`))
    }, START_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      const match = HOST_LINE.exec(output)
      if (match !== null) finish(undefined, match[1])
    })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', (error) => finish(error))
    child.once('exit', (code) => {
      hostProcess = null
      if (!settled) finish(new Error(`dsh завершился с кодом ${String(code)}. ${stderr.slice(-500)}`))
      else if (!shuttingDown) {
        dialog.showErrorBox(APP_NAME, 'Хост DeepSeek Harness завершился. Приложение будет закрыто.')
        app.quit()
      }
    })
  })
}

/** Allow the microphone only for the harness origin; deny everything else. */
function restrictPermissions(origin) {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requesting = details !== undefined && details.requestingUrl !== undefined
      ? details.requestingUrl
      : webContents.getURL()
    callback(permission === 'media' && requesting.startsWith(origin))
  })
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return permission === 'media' && String(requestingOrigin).startsWith(origin)
  })
}

function createWindow(url) {
  restrictPermissions(new URL(url).origin)
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  mainWindow.setMenuBarVisibility(false)

  let zoomLevel = readZoomLevel()
  const applyZoom = () => { mainWindow?.webContents.setZoomLevel(zoomLevel) }
  mainWindow.webContents.on('did-finish-load', applyZoom)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.control !== true || input.alt === true || input.meta === true) return
    let next
    if (input.key === '=' || input.key === '+' || input.key === 'Add') next = zoomLevel + ZOOM_STEP
    else if (input.key === '-' || input.key === '_' || input.key === 'Subtract') next = zoomLevel - ZOOM_STEP
    else if (input.key === '0') next = 0
    else return
    event.preventDefault()
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    event.sender.setZoomLevel(zoomLevel)
    saveZoomLevel(zoomLevel)
  })

  mainWindow.loadURL(url)
  mainWindow.once('ready-to-show', () => { mainWindow.show() })
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://')) void shell.openExternal(target)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

function stopHost() {
  shuttingDown = true
  if (hostProcess === null) return
  const child = hostProcess
  hostProcess = null
  try { child.kill('SIGTERM') } catch { /* already gone */ }
  setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already gone */ } }, 4_000).unref()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setName(APP_NAME)
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    if (process.argv.includes('--self-test')) {
      const resolved = resolveDsh()
      console.log(JSON.stringify({
        dsh: resolved === undefined ? null : resolved,
        node: resolveNode() ?? 'electron',
        portFree: await isPortFree(PORT),
      }, null, 2))
      app.quit()
      return
    }
    Menu.setApplicationMenu(null)
    if (!(await isPortFree(PORT))) {
      dialog.showErrorBox(APP_NAME,
        `Порт ${PORT} уже занят — вероятно, dsh web запущен в терминале.\n`
        + 'Остановите его и запустите приложение снова.',
      )
      app.quit()
      return
    }
    try {
      const url = await startHost()
      createWindow(url)
    } catch (error) {
      dialog.showErrorBox(APP_NAME, error instanceof Error ? error.message : String(error))
      stopHost()
      app.quit()
    }
  })

  app.on('window-all-closed', () => { app.quit() })
  app.on('before-quit', () => { stopHost() })
}
